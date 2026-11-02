import { NextRequest, NextResponse } from 'next/server';
import { PLAN_COLS, q, q1 } from '@/lib/db';
import { aiClient, aiModel, parseJsonLoose } from '@/lib/ai';
import { ROOM_TYPES, FIXTURE_KINDS, OPENING_TYPES, type Analysis, type Pt } from '@/lib/types';

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const ROOM_KEYS = Object.keys(ROOM_TYPES).join(' | ');
const FIX_KEYS = Object.keys(FIXTURE_KINDS).join(' | ');
const OPEN_KEYS = Object.keys(OPENING_TYPES).join(' | ');

function systemPrompt(discipline: string) {
  const common = `אתה מהנדס/אדריכל ישראלי מומחה בקריאת תכניות בניין. תקבל תמונה של תכנית. נתח אותה והחזר JSON בלבד (ללא טקסט נוסף).
כל הקואורדינטות מנורמלות לתמונה: x מ-0 (שמאל) עד 1 (ימין), y מ-0 (למעלה) עד 1 (למטה).
כללים: אל תמציא חללים או אביזרים שאינם נראים. אם משהו לא ברור – השמט אותו והוסף הערה ב-warnings. שמות חללים בעברית כפי שכתובים בתכנית.
מבנה JSON:
{
 "summary": "תיאור קצר בעברית של מה שמופיע בתכנית",
 "planType": "dwelling_floor | building_floor | section | elevation | site | other",
 "scale": { "ratio": מספר או null (למשל 50 עבור 1:50, לפי הכיתוב בתכנית), "referenceDimension": { "p1": [x,y], "p2": [x,y], "meters": מספר } או null (קו מידה ברור עם ערך במטרים), "note": "מה כתוב בתכנית על קנה המידה" },
 "units": [ { "name": "שם הדירה/היחידה כפי שמופיע" } ],
 "rooms": [ { "name": "...", "type": "${ROOM_KEYS}", "unit": "שם יחידה או null", "polygon": [[x,y],...] } ],
 "openings": [ { "type": "${OPEN_KEYS}", "x": מרכז, "y": מרכז, "widthM": מטרים או null, "heightM": מטרים או null, "tag": "סימון או null", "room": "שם חלל או null" } ],
 "fixtures": [ { "kind": "${FIX_KEYS}", "x": .., "y": .., "room": "שם חלל או null" } ],
 "elements": [ { "type": "column | beam | shearwall", "polygon": [[x,y],...] } ],
 "warnings": [ "..." ]
}
polygon של חלל = מצולע סגור סביב הפנים של החלל (לפי קווי הקירות), עם 4 נקודות לפחות, בסדר עקבי. הקפד על דיוק גיאומטרי.`;
  if (discipline === 'architecture')
    return common + '\nזוהי תכנית אדריכלות: מלא rooms, openings (דלתות/חלונות/דלת הזזה, עם מידות אם כתובות), units. fixtures ו-elements – מערכים ריקים.';
  if (discipline === 'electrical')
    return common + '\nזוהי תכנית חשמל: מלא fixtures מסוגי חשמל בלבד (שקעים, מפסקים, תאורה, לוח, תקשורת, טלוויזיה, מזגן, אינטרקום) וכן rooms בקירוב (לשיוך האביזרים). openings ו-elements ריקים.';
  if (discipline === 'plumbing')
    return common + '\nזוהי תכנית אינסטלציה: מלא fixtures מסוגי אינסטלציה בלבד (אסלה, כיור, מקלחון, אמבטיה, כיור מטבח, מכונת כביסה, מדיח, דוד, ניקוז, ברז) וכן rooms בקירוב. openings ו-elements ריקים.';
  if (discipline === 'structure')
    return common + '\nזוהי תכנית קונסטרוקציה: מלא elements (עמודים, קורות, קירות הדף/גזירה) וכן rooms בקירוב. fixtures ו-openings ריקים.';
  return common;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number(n) || 0));
const toPt = (p: any): Pt => [clamp01(p?.[0]), clamp01(p?.[1])];

export async function POST(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const body = await req.json();
  const image: string = body.imageDataUrl;
  if (!image?.startsWith('data:image/')) return NextResponse.json({ error: 'חסרה תמונת תכנית לניתוח' }, { status: 400 });
  const plan = await q1<any>(`select ${PLAN_COLS} from plans where id=$1`, [id]);
  if (!plan) return NextResponse.json({ error: 'תכנית לא נמצאה' }, { status: 404 });

  let raw: any;
  try {
    const r = await aiClient().chat.completions.create({
      model: aiModel(),
      temperature: 0.1,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(plan.discipline) },
        {
          role: 'user',
          content: [
            { type: 'text', text: `נתח את התכנית. שם התכנית: ${plan.name}. תחום: ${plan.discipline}. ${body.scaleRatio ? `קנה מידה מוצהר: 1:${body.scaleRatio}.` : ''} ${body.hint || ''}` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    });
    raw = parseJsonLoose(r.choices[0]?.message?.content || '');
  } catch (e: any) {
    return NextResponse.json({ error: 'ניתוח ה-AI נכשל: ' + (e?.message || e) }, { status: 502 });
  }

  // יחידות: התאמה לפי שם בקומה, יצירה אם חסר
  const units = await q<any>('select * from units where project_id=$1', [plan.project_id]);
  const unitByName = new Map<string, number>();
  for (const u of units) if (u.floor_id === plan.floor_id) unitByName.set(u.name.trim(), u.id);
  const getUnit = async (name?: string | null) => {
    if (!name || !String(name).trim()) return null;
    const key = String(name).trim();
    if (unitByName.has(key)) return unitByName.get(key)!;
    const nu = await q1<any>('insert into units(project_id,floor_id,name) values($1,$2,$3) returning id', [plan.project_id, plan.floor_id, key]);
    unitByName.set(key, nu.id);
    return nu.id as number;
  };

  const rooms: Analysis['rooms'] = [];
  for (const [i, r] of (raw.rooms || []).entries()) {
    if (!Array.isArray(r.polygon) || r.polygon.length < 3) continue;
    rooms.push({
      id: `r${i + 1}`,
      name: String(r.name || `חלל ${i + 1}`),
      type: (ROOM_TYPES as any)[r.type] ? r.type : 'other',
      unitId: await getUnit(r.unit),
      polygon: r.polygon.map(toPt),
    });
  }
  const roomByName = (n?: string | null) => (n ? rooms.find((x) => x.name === n)?.id : undefined);
  const DEF_H: Record<string, number> = { door: 2.05, entrance: 2.1, window: 1.2, sliding: 2.1, other: 1 };
  const DEF_W: Record<string, number> = { door: 0.8, entrance: 0.95, window: 1.2, sliding: 2.0, other: 0.8 };
  const openings: Analysis['openings'] = (raw.openings || []).map((o: any, i: number) => {
    const type = (OPENING_TYPES as any)[o.type] ? o.type : 'other';
    const hasW = Number(o.widthM) > 0, hasH = Number(o.heightM) > 0;
    return {
      id: `o${i + 1}`, type, x: clamp01(o.x), y: clamp01(o.y),
      wM: hasW ? Number(o.widthM) : DEF_W[type], hM: hasH ? Number(o.heightM) : DEF_H[type],
      tag: o.tag || undefined, room: roomByName(o.room), assumed: !(hasW && hasH),
    };
  });
  const fixtures: Analysis['fixtures'] = (raw.fixtures || [])
    .filter((f: any) => (FIXTURE_KINDS as any)[f.kind])
    .map((f: any, i: number) => ({ id: `f${i + 1}`, kind: f.kind, x: clamp01(f.x), y: clamp01(f.y), room: roomByName(f.room) }));
  const elements = (raw.elements || [])
    .filter((e: any) => Array.isArray(e.polygon) && e.polygon.length >= 3)
    .map((e: any, i: number) => ({ id: `e${i + 1}`, type: ['column', 'beam', 'shearwall'].includes(e.type) ? e.type : 'column', polygon: e.polygon.map(toPt) }));

  const analysis: Analysis = {
    version: 1, source: 'ai', summary: raw.summary, scaleNote: raw.scale?.note,
    rooms, openings, fixtures, elements, warnings: raw.warnings || [],
  };

  // קנה מידה: ידני / seed נשמרים; אחרת יחס+גודל נייר; אחרת מידה מצוינת על ידי ה-AI
  let mpp: number | null = plan.mpp, src: string | null = plan.scale_source, ratio = plan.scale_ratio;
  if (!(src === 'manual' || src === 'seed')) {
    const aiRatio = Number(raw.scale?.ratio) || null;
    ratio = ratio || aiRatio;
    if (ratio && plan.paper_width_mm) { mpp = ((plan.paper_width_mm / 1000) * ratio) / plan.width; src = 'ratio'; }
    else if (raw.scale?.referenceDimension?.meters > 0) {
      const { p1, p2, meters } = raw.scale.referenceDimension;
      const dpx = Math.hypot((clamp01(p2?.[0]) - clamp01(p1?.[0])) * plan.width, (clamp01(p2?.[1]) - clamp01(p1?.[1])) * plan.height);
      if (dpx > 5) { mpp = Number(meters) / dpx; src = 'ai-dimension'; }
    }
    if (!mpp) analysis.warnings!.push('לא זוהה קנה מידה – השתמשו בכלי "כיול קנה מידה" כדי למדוד שטחים.');
  }

  const row = await q1(
    `update plans set analysis=$1, analyzed_at=now(), mpp=$2, scale_source=$3, scale_ratio=$4 where id=$5 returning ${PLAN_COLS}`,
    [JSON.stringify(analysis), mpp, src, ratio, id],
  );
  const newUnits = await q('select * from units where project_id=$1 order by id', [plan.project_id]);
  return NextResponse.json({ plan: row, units: newUnits });
}
