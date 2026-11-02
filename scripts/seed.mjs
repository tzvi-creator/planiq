import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildFloorModel, renderPlanSVG, buildAnalysis, renderElevation, renderSection, PX } from './generator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// טעינת .env מקומי אם קיים (ב-Vercel המשתנים כבר מוגדרים)
const envFile = path.join(here, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const reset = process.argv.includes('--reset');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (t, p) => pool.query(t, p).then((r) => r.rows);

await pool.query(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
console.log('סכמה מוכנה');

const existing = await q('select count(*)::int c from projects');
if (existing[0].c > 0 && !reset) {
  console.log('כבר קיימים פרויקטים – מדלג על נתוני דוגמה (השתמש ב- --reset לאיפוס).');
  await pool.end();
  process.exit(0);
}
if (reset) {
  await pool.query('truncate projects restart identity cascade');
  console.log('נמחקו כל הנתונים הקיימים');
}

const PROJECTS = [
  {
    name: 'מגדלי הים – בניין A',
    address: 'רחוב הים 12, נתניה',
    description: 'בניין מגורים בן 2 קומות טיפוסיות, שתי דירות בכל קומה ומעלית מרכזית (נתוני דוגמה).',
    sx: 1.0, sy: 1.0,
    floors: [
      { name: 'קומה 1', apts: ['דירה 1', 'דירה 2'], variants: [{ defects: ['socketNearShower', 'drainInBedroom', 'socketInDoor'] }, {}] },
      { name: 'קומה 2', apts: ['דירה 3', 'דירה 4'], variants: [{ socketOverride: { salon: 3 } }, {}] },
    ],
  },
  {
    name: 'פארק הגפן – מבנה B',
    address: 'שדרות הגפן 5, רעננה',
    description: 'מבנה מגורים בן 2 קומות עם דירות גדולות יותר (נתוני דוגמה).',
    sx: 1.12, sy: 1.08,
    floors: [
      { name: 'קומה 1', apts: ['דירה 1', 'דירה 2'], variants: [{}, { socketOverride: { master: 2 } }] },
      { name: 'קומה 2', apts: ['דירה 3', 'דירה 4'], variants: [{ defects: ['socketNearShower'] }, {}] },
    ],
  },
];

for (const P of PROJECTS) {
  const [proj] = await q('insert into projects(name,address,description) values($1,$2,$3) returning id', [P.name, P.address, P.description]);
  const planIds = [];
  for (let fi = 0; fi < P.floors.length; fi++) {
    const F = P.floors[fi];
    const [floor] = await q('insert into floors(project_id,name,sort) values($1,$2,$3) returning id', [proj.id, F.name, fi]);
    const unitIds = [];
    for (const name of F.apts) {
      const [u] = await q('insert into units(project_id,floor_id,name) values($1,$2,$3) returning id', [proj.id, floor.id, name]);
      unitIds.push(u.id);
    }
    const model = buildFloorModel({ sx: P.sx, sy: P.sy, floorIdx: fi + 1, aptNames: F.apts, variants: F.variants });
    for (const [disc, label] of [['architecture', 'תכנית אדריכלות'], ['electrical', 'תכנית חשמל'], ['plumbing', 'תכנית אינסטלציה']]) {
      const r = renderPlanSVG({ model, discipline: disc, title: label, floorLabel: F.name, projectName: P.name, aptNames: F.apts });
      const analysis = buildAnalysis({ model, W: r.W, H: r.H, px: r.px, unitIds, discipline: disc });
      const paperMm = (r.W / PX) * 20;
      const [pl] = await q(
        `insert into plans(project_id,floor_id,name,filename,discipline,kind,mime,data,width,height,paper_width_mm,scale_ratio,mpp,scale_source,analysis,analyzed_at)
         values($1,$2,$3,$4,$5,'plan','image/svg+xml',$6,$7,$8,$9,50,$10,'seed',$11,now()) returning id`,
        [proj.id, floor.id, `${label} – ${F.name}`, `${disc}-floor${fi + 1}.svg`, disc, Buffer.from(r.svg, 'utf8'), r.W, r.H, paperMm, 1 / PX, JSON.stringify(analysis)],
      );
      planIds.push(pl.id);
    }
    if (fi === 0) {
      P._model = model;
    }
  }
  // חזית וחתך (ללא ניתוח כמותי)
  const m = P._model;
  const elev = renderElevation({ projectName: P.name, totalW: m.totalW, floors: P.floors.length, sx: P.sx });
  const sect = renderSection({ projectName: P.name, totalH: m.totalH, floors: P.floors.length });
  for (const [name, svg, kind, file] of [['חזית קדמית', elev, 'elevation', 'elevation-front.svg'], ['חתך א-א', sect, 'section', 'section-aa.svg']]) {
    const w = Number(svg.match(/width="(\d+)"/)[1]), h = Number(svg.match(/height="(\d+)"/)[1]);
    await q(
      `insert into plans(project_id,floor_id,name,filename,discipline,kind,mime,data,width,height,scale_ratio,mpp,scale_source)
       values($1,null,$2,$3,'architecture',$4,'image/svg+xml',$5,$6,$7,50,$8,'seed')`,
      [proj.id, name, file, kind, Buffer.from(svg, 'utf8'), w, h, 1 / PX],
    );
  }
  console.log(`נוצר פרויקט: ${P.name} (id ${proj.id}), ${planIds.length} תכניות קומה`);
}

// תשובות חלקיות לטופס המפרט בפרויקט הראשון – כדי שהמערכת תיראה "חיה"
const [first] = await q('select id from projects order by id limit 1');
await q(
  `insert into spec_answers(project_id, answers) values($1,$2)
   on conflict (project_id) do update set answers=excluded.answers`,
  [first.id, JSON.stringify({ seller: 'חברת הדוגמה לבנייה בע"מ', structure: 'שלד בטון מזוין, קירות חוץ בלוקי בטון מבודדים', floorTiles: 'גרניט פורצלן 60x60, דרגת החלקה R9 ברחצה' })],
);
console.log('סיום');
await pool.end();
