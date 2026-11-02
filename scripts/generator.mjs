// מחולל תכניות דוגמה: יוצר SVG של תכניות אדריכלות / חשמל / אינסטלציה + נתוני ניתוח (חללים, פתחים, אביזרים)
// כל הקואורדינטות במטרים, ממירים לפיקסלים (50 פיקסל למטר => קנה מידה 1:50 על דף בגודל מתאים).

export const PX = 50;
const MARGIN = 80;

// ----- תבנית דירה (קואורדינטות מקומיות במטרים; הדירה "שמאלית", הכניסה בקיר המזרחי) -----
const ROOMS = [
  ['balcony', 'מרפסת שמש', 'balcony', 0, 0, 3.2, 1.5],
  ['salon', 'סלון', 'salon', 0, 1.5, 4.8, 4.5],
  ['kitchen', 'מטבח', 'kitchen', 4.8, 1.5, 4.2, 2.6],
  ['toilet', 'שירותים', 'toilet', 4.8, 4.1, 1.8, 1.9],
  ['entry', 'מבואה', 'entry', 6.6, 4.1, 2.4, 1.9],
  ['corridor', 'מסדרון', 'corridor', 0, 6.0, 9.0, 1.1],
  ['mamad', 'ממ"ד', 'mamad', 0, 7.1, 3.0, 3.3],
  ['bath', 'חדר רחצה', 'bath', 3.0, 7.1, 2.7, 2.3],
  ['laundry', 'חדר כביסה', 'laundry', 3.0, 9.4, 2.7, 2.6],
  ['master', 'חדר שינה הורים', 'master', 5.7, 7.1, 3.3, 4.9],
  ['storage', 'מחסן', 'storage', 0, 10.4, 3.0, 1.6],
];

// [חדר, קיר, היסט לאורך הקיר, רוחב, סוג, גובה, אדן, סימון]
const OPENINGS = [
  ['entry', 'E', 0.5, 0.95, 'entrance', 2.1, 0, 'ד-כ'],
  ['kitchen', 'W', 0.9, 0.9, 'door', 2.05, 0, 'ד2'],
  ['salon', 'S', 1.2, 0.9, 'door', 2.05, 0, 'ד1'],
  ['toilet', 'S', 0.5, 0.7, 'door', 2.05, 0, 'ד3'],
  ['mamad', 'N', 0.4, 0.9, 'door', 2.1, 0, 'ד-ממ"ד'],
  ['bath', 'N', 0.3, 0.7, 'door', 2.05, 0, 'ד4'],
  ['laundry', 'N', 0.9, 0.7, 'door', 2.05, 0, 'ד5'],
  ['storage', 'E', 0.3, 0.7, 'door', 2.05, 0, 'ד6'],
  ['master', 'N', 0.4, 0.8, 'door', 2.05, 0, 'ד7'],
  ['salon', 'N', 0.8, 2.2, 'sliding', 2.1, 0, 'ד-מ'],
  ['salon', 'W', 1.5, 1.5, 'window', 1.2, 0.9, 'ח1'],
  ['kitchen', 'N', 1.2, 1.2, 'window', 1.2, 0.9, 'ח2'],
  ['mamad', 'W', 1.2, 0.8, 'window', 1.0, 1.0, 'ח-ממ"ד'],
  ['laundry', 'S', 0.8, 0.8, 'window', 0.6, 1.5, 'ח3'],
  ['master', 'S', 1.0, 1.4, 'window', 1.2, 0.9, 'ח4'],
  ['storage', 'W', 0.4, 0.6, 'window', 0.6, 1.5, 'ח5'],
];

const ELECTRIC = {
  salon: { light: 2, switch: 1, socket: 5, tv: 1, data: 1, ac: 1 },
  kitchen: { light: 1, switch: 1, socket: 4 },
  master: { light: 1, switch: 1, socket: 4, tv: 1, data: 1, ac: 1 },
  mamad: { light: 1, switch: 1, socket: 3, data: 1 },
  bath: { light: 1, switch: 1, socket: 1 },
  toilet: { light: 1, switch: 1 },
  laundry: { light: 1, switch: 1, socket: 2 },
  storage: { light: 1, switch: 1, socket: 1 },
  corridor: { light: 2, switch: 1 },
  entry: { light: 1, switch: 1, panel: 1, intercom: 1 },
  balcony: { light: 1, socket: 1 },
};

// מיקום אביזרי אינסטלציה כשבר מתוך החדר
const PLUMBING = {
  kitchen: [['kitchen_sink', 0.43, 0.1], ['dishwasher', 0.72, 0.1]],
  bath: [['sink', 0.55, 0.12], ['shower', 0.78, 0.74], ['drain', 0.78, 0.74]],
  toilet: [['toilet', 0.5, 0.2], ['sink', 0.82, 0.55]],
  laundry: [['washer', 0.2, 0.25], ['drain', 0.5, 0.55], ['boiler', 0.82, 0.2]],
  balcony: [['tap', 0.9, 0.5], ['drain', 0.5, 0.5]],
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildApartment({ key, name, unitIdx, X0, sx, sy, mirror, variant }) {
  const Wa = 9.0 * sx;
  const mapX = (x, w = 0) => (mirror ? X0 + Wa - x - w : X0 + x);
  const rooms = ROOMS.map(([k, nm, type, x, y, w, h]) => {
    const rw = w * sx, rh = h * sy;
    return { key: k, id: `${key}-${k}`, name: nm, type, unitIdx, x: mapX(x * sx, rw), y: y * sy, w: rw, h: rh };
  });
  const byKey = Object.fromEntries(rooms.map((r) => [r.key, r]));
  const openings = OPENINGS.map(([rk, side, off, w, type, h, sill, tag], i) => {
    const r = byKey[rk];
    const realSide = mirror ? { E: 'W', W: 'E', N: 'N', S: 'S' }[side] : side;
    let cx, cy, orient, nx = 0, ny = 0;
    // היסט נמדד מצד שמאל (בצד השמאלי המקורי) – בדירה הפוכה משקפים
    if (side === 'N' || side === 'S') {
      const offM = off * sx;
      const localLeft = mirror ? null : r.x + offM;
      cx = mirror ? r.x + r.w - offM - w / 2 : localLeft + w / 2;
      cy = side === 'N' ? r.y : r.y + r.h;
      orient = 'h';
      ny = side === 'N' ? 1 : -1;
    } else {
      const offM = off * sy;
      cy = r.y + offM + w / 2;
      cx = realSide === 'W' ? r.x : r.x + r.w;
      orient = 'v';
      nx = realSide === 'W' ? 1 : -1;
    }
    return { id: `${key}-o${i + 1}`, room: r.id, type, cx, cy, orient, nx, ny, w, h, sill, tag: tag.replace(/^(.)/, '$1') };
  });

  // ----- אביזרי חשמל -----
  const nearOpening = (px, py, pad = 0.22) =>
    openings.some((o) => {
      const along = o.orient === 'h' ? Math.abs(px - o.cx) : Math.abs(py - o.cy);
      const across = o.orient === 'h' ? Math.abs(py - o.cy) : Math.abs(px - o.cx);
      return along < o.w / 2 + pad && across < 0.6;
    });
  const perimeter = (r, inset = 0.28, step = 0.85) => {
    const pts = [];
    const x0 = r.x + inset, x1 = r.x + r.w - inset, y0 = r.y + inset, y1 = r.y + r.h - inset;
    for (let x = x0; x <= x1 + 1e-6; x += step) { pts.push([x, y0]); pts.push([x, y1]); }
    for (let y = y0 + step; y < y1 - 1e-6; y += step) { pts.push([x0, y]); pts.push([x1, y]); }
    return pts.filter(([px, py]) => !nearOpening(px, py));
  };
  const pick = (arr, n, offset = 0) => {
    if (!arr.length || n <= 0) return [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(arr[Math.floor(((i + 0.5) / n) * arr.length + offset) % arr.length]);
    return out;
  };

  const fixtures = [];
  let fid = 0;
  const addFx = (kind, x, y, r) => fixtures.push({ id: `${key}-f${++fid}`, kind, x, y, room: r.id, unitIdx });

  for (const r of rooms) {
    const spec = { ...(ELECTRIC[r.key] || {}) };
    if (variant?.socketOverride?.[r.key] !== undefined) spec.socket = variant.socketOverride[r.key];
    const per = perimeter(r);
    for (const [kind, n] of Object.entries(spec)) {
      if (kind === 'light') {
        for (let i = 0; i < n; i++) addFx('light', r.x + r.w / 2 + (n > 1 ? (i - (n - 1) / 2) * (r.w > r.h ? r.w / 2.6 : 0) : 0), r.y + r.h / 2 + (n > 1 && r.w <= r.h ? (i - (n - 1) / 2) * (r.h / 2.6) : 0), r);
      } else if (kind === 'switch') {
        const door = openings.find((o) => o.room === r.id && (o.type === 'door' || o.type === 'entrance'));
        if (door) {
          const sideShift = door.w / 2 + 0.4;
          let px = door.orient === 'h' ? door.cx + sideShift : door.cx + door.nx * 0.28;
          let py = door.orient === 'h' ? door.cy + door.ny * 0.28 : door.cy + sideShift;
          if (px > r.x + r.w - 0.2 || py > r.y + r.h - 0.2) {
            px = door.orient === 'h' ? door.cx - sideShift : px;
            py = door.orient === 'v' ? door.cy - sideShift : py;
          }
          addFx('switch', px, py, r);
        } else addFx('switch', r.x + 0.3, r.y + 0.6, r);
      } else {
        pick(per, n, kind === 'tv' ? 3 : kind === 'ac' ? 5 : kind === 'data' ? 1 : kind === 'panel' ? 2 : kind === 'intercom' ? 4 : 0)
          .forEach(([px, py]) => addFx(kind, px, py, r));
      }
    }
  }
  // אביזרי אינסטלציה
  for (const [rk, list] of Object.entries(PLUMBING)) {
    const r = byKey[rk];
    for (const [kind, fx, fy] of list) {
      const px = mirror ? r.x + r.w - fx * r.w : r.x + fx * r.w;
      addFx(kind, px, r.y + fy * r.h, r);
    }
  }
  // ----- חריגות מכוונות לדוגמה (לצורך הדגמת בדיקות והתנגשויות) -----
  if (variant?.defects) {
    const bath = byKey.bath, master = byKey.master;
    const shower = fixtures.find((f) => f.room === bath.id && f.kind === 'shower');
    if (variant.defects.includes('socketNearShower'))
      addFx('socket', shower.x + (mirror ? 0.4 : -0.4), shower.y - 0.25, bath);
    if (variant.defects.includes('drainInBedroom'))
      addFx('drain', master.x + master.w * 0.5, master.y + master.h * 0.55, master);
    if (variant.defects.includes('socketInDoor')) {
      const d = openings.find((o) => o.room === master.id && o.type === 'door');
      addFx('socket', d.cx, d.cy + d.ny * 0.25, master);
    }
  }
  return { rooms, openings, fixtures, Wa };
}

// ----- קונפיגורציה של בניין -----
// floors: [{ label, aptNames:[a,b] }]; sx,sy גורמי קנה מידה לגודל חללים
export function buildFloorModel({ sx, sy, floorIdx, aptNames, variants }) {
  const Wa = 9.0 * sx;
  const coreW = 3.0;
  const aptA = buildApartment({ key: `a${floorIdx}`, name: aptNames[0], unitIdx: 0, X0: 0, sx, sy, mirror: false, variant: variants?.[0] });
  const aptB = buildApartment({ key: `b${floorIdx}`, name: aptNames[1], unitIdx: 1, X0: Wa + coreW, sx, sy, mirror: true, variant: variants?.[1] });
  const H = 12.0 * sy;
  const core = { key: 'core', id: `c${floorIdx}-core`, name: 'חדר מדרגות ומעלית', type: 'stairs', unitIdx: null, x: Wa, y: 0, w: coreW, h: H };
  return {
    totalW: 2 * Wa + coreW, totalH: H, Wa, coreW,
    rooms: [...aptA.rooms, ...aptB.rooms, core],
    openings: [...aptA.openings, ...aptB.openings],
    fixtures: [...aptA.fixtures, ...aptB.fixtures],
    apts: [aptA, aptB],
  };
}

// ----- ציור SVG -----
function symbol(kind, X, Y) {
  const e = '#c62828', p = '#1565c0';
  switch (kind) {
    case 'socket': return `<g><circle cx="${X}" cy="${Y}" r="5" fill="#fff" stroke="${e}" stroke-width="1.6"/><line x1="${X - 3}" y1="${Y - 6}" x2="${X - 3}" y2="${Y - 10}" stroke="${e}" stroke-width="1.6"/><line x1="${X + 3}" y1="${Y - 6}" x2="${X + 3}" y2="${Y - 10}" stroke="${e}" stroke-width="1.6"/></g>`;
    case 'switch': return `<g><circle cx="${X}" cy="${Y}" r="3.5" fill="${e}"/><line x1="${X}" y1="${Y}" x2="${X + 8}" y2="${Y - 8}" stroke="${e}" stroke-width="1.6"/></g>`;
    case 'light': return `<g><circle cx="${X}" cy="${Y}" r="7" fill="#fff" stroke="${e}" stroke-width="1.6"/><line x1="${X - 5}" y1="${Y - 5}" x2="${X + 5}" y2="${Y + 5}" stroke="${e}" stroke-width="1.4"/><line x1="${X + 5}" y1="${Y - 5}" x2="${X - 5}" y2="${Y + 5}" stroke="${e}" stroke-width="1.4"/></g>`;
    case 'panel': return `<g><rect x="${X - 9}" y="${Y - 6}" width="18" height="12" fill="#ffe0e0" stroke="${e}" stroke-width="1.8"/><text x="${X}" y="${Y + 3.5}" font-size="9" text-anchor="middle" fill="${e}" font-weight="700">ל</text></g>`;
    case 'data': return `<g><rect x="${X - 6}" y="${Y - 6}" width="12" height="12" fill="#fff" stroke="#6a1b9a" stroke-width="1.6"/><text x="${X}" y="${Y + 3.5}" font-size="9" text-anchor="middle" fill="#6a1b9a" font-weight="700">D</text></g>`;
    case 'tv': return `<g><rect x="${X - 8}" y="${Y - 6}" width="16" height="12" fill="#fff" stroke="#6a1b9a" stroke-width="1.6"/><text x="${X}" y="${Y + 3.5}" font-size="8" text-anchor="middle" fill="#6a1b9a" font-weight="700">TV</text></g>`;
    case 'ac': return `<g><rect x="${X - 8}" y="${Y - 6}" width="16" height="12" fill="#fff" stroke="#00838f" stroke-width="1.6"/><text x="${X}" y="${Y + 3.5}" font-size="8" text-anchor="middle" fill="#00838f" font-weight="700">AC</text></g>`;
    case 'intercom': return `<g><rect x="${X - 6}" y="${Y - 6}" width="12" height="12" fill="#fff" stroke="${e}" stroke-width="1.6"/><text x="${X}" y="${Y + 3.5}" font-size="8" text-anchor="middle" fill="${e}" font-weight="700">IC</text></g>`;
    case 'toilet': return `<g><ellipse cx="${X}" cy="${Y + 3}" rx="8" ry="11" fill="#e3f2fd" stroke="${p}" stroke-width="1.8"/><rect x="${X - 7}" y="${Y - 14}" width="14" height="6" fill="#e3f2fd" stroke="${p}" stroke-width="1.8"/></g>`;
    case 'sink': return `<g><rect x="${X - 11}" y="${Y - 7}" width="22" height="14" rx="5" fill="#e3f2fd" stroke="${p}" stroke-width="1.8"/><circle cx="${X}" cy="${Y}" r="2" fill="${p}"/></g>`;
    case 'shower': return `<g><rect x="${X - 22}" y="${Y - 22}" width="44" height="44" fill="#e3f2fd" fill-opacity=".7" stroke="${p}" stroke-width="1.8"/><line x1="${X - 22}" y1="${Y - 22}" x2="${X + 22}" y2="${Y + 22}" stroke="${p}" stroke-width="1"/><line x1="${X + 22}" y1="${Y - 22}" x2="${X - 22}" y2="${Y + 22}" stroke="${p}" stroke-width="1"/></g>`;
    case 'kitchen_sink': return `<g><rect x="${X - 18}" y="${Y - 9}" width="36" height="18" fill="#e3f2fd" stroke="${p}" stroke-width="1.8"/><line x1="${X}" y1="${Y - 9}" x2="${X}" y2="${Y + 9}" stroke="${p}" stroke-width="1.4"/></g>`;
    case 'dishwasher': return `<g><rect x="${X - 10}" y="${Y - 9}" width="20" height="18" fill="#fff" stroke="${p}" stroke-width="1.6"/><text x="${X}" y="${Y + 3.5}" font-size="9" text-anchor="middle" fill="${p}" font-weight="700">מד</text></g>`;
    case 'washer': return `<g><rect x="${X - 11}" y="${Y - 11}" width="22" height="22" fill="#fff" stroke="${p}" stroke-width="1.6"/><circle cx="${X}" cy="${Y}" r="6" fill="none" stroke="${p}" stroke-width="1.4"/></g>`;
    case 'boiler': return `<g><circle cx="${X}" cy="${Y}" r="10" fill="#fff3e0" stroke="#ef6c00" stroke-width="1.8"/><text x="${X}" y="${Y + 3.5}" font-size="9" text-anchor="middle" fill="#ef6c00" font-weight="700">דוד</text></g>`;
    case 'drain': return `<g><circle cx="${X}" cy="${Y}" r="6" fill="#fff" stroke="${p}" stroke-width="1.6"/><line x1="${X - 4}" y1="${Y - 4}" x2="${X + 4}" y2="${Y + 4}" stroke="${p}" stroke-width="1.4"/><line x1="${X + 4}" y1="${Y - 4}" x2="${X - 4}" y2="${Y + 4}" stroke="${p}" stroke-width="1.4"/></g>`;
    case 'tap': return `<g><circle cx="${X}" cy="${Y}" r="5" fill="${p}"/><text x="${X + 9}" y="${Y + 4}" font-size="9" fill="${p}">ברז</text></g>`;
    default: return '';
  }
}

export function renderPlanSVG({ model, discipline, title, floorLabel, projectName, aptNames }) {
  const W = Math.round(model.totalW * PX + MARGIN * 2);
  const H = Math.round(model.totalH * PX + MARGIN + 130);
  const px = (m) => Math.round((m * PX + MARGIN) * 100) / 100;
  const arch = discipline === 'architecture';
  const wallC = arch ? '#1b1b1b' : '#9e9e9e';
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  // חללים
  for (const r of model.rooms) {
    const fill = r.type === 'stairs' ? '#eceff1' : '#ffffff';
    parts.push(`<rect x="${px(r.x)}" y="${px(r.y)}" width="${r.w * PX}" height="${r.h * PX}" fill="${fill}" stroke="${wallC}" stroke-width="${arch ? 3 : 2}"/>`);
  }
  // קו חוץ עבה
  const outer = model.rooms.filter((r) => r.type !== 'corridor');
  const ox0 = 0, oy0 = 0;
  parts.push(`<rect x="${px(ox0)}" y="${px(oy0)}" width="${model.totalW * PX}" height="${model.totalH * PX}" fill="none" stroke="${wallC}" stroke-width="${arch ? 8 : 5}"/>`);
  // חדר מדרגות
  const core = model.rooms.find((r) => r.type === 'stairs');
  for (let i = 1; i < 12; i++) {
    const yy = px(core.y + 1.0) + i * 14;
    parts.push(`<line x1="${px(core.x + 0.3)}" y1="${yy}" x2="${px(core.x + 1.7)}" y2="${yy}" stroke="${wallC}" stroke-width="1"/>`);
  }
  parts.push(`<rect x="${px(core.x + 1.9)}" y="${px(core.y + 1.0)}" width="${0.9 * PX}" height="${1.3 * PX}" fill="#fff" stroke="${wallC}" stroke-width="1.5"/><text x="${px(core.x + 2.35)}" y="${px(core.y + 1.65)}" font-size="10" text-anchor="middle" fill="${wallC}">מעלית</text>`);
  // פתחים
  for (const o of model.openings) {
    const half = o.w / 2;
    const X = px(o.cx), Y = px(o.cy);
    if (o.orient === 'h') {
      parts.push(`<line x1="${X - half * PX}" y1="${Y}" x2="${X + half * PX}" y2="${Y}" stroke="#fff" stroke-width="${arch ? 9 : 6}"/>`);
    } else {
      parts.push(`<line x1="${X}" y1="${Y - half * PX}" x2="${X}" y2="${Y + half * PX}" stroke="#fff" stroke-width="${arch ? 9 : 6}"/>`);
    }
    if (!arch) continue;
    if (o.type === 'door' || o.type === 'entrance') {
      const w = o.w * PX;
      if (o.orient === 'h') {
        const hx = X - half * PX, ex = X + half * PX, ty = Y + o.ny * w;
        parts.push(`<line x1="${hx}" y1="${Y}" x2="${hx}" y2="${ty}" stroke="#333" stroke-width="1.6"/><path d="M ${hx} ${ty} A ${w} ${w} 0 0 ${o.ny > 0 ? 0 : 1} ${ex} ${Y}" fill="none" stroke="#777" stroke-width="1" stroke-dasharray="3 2"/>`);
      } else {
        const hy = Y - half * PX, ey = Y + half * PX, tx = X + o.nx * w;
        parts.push(`<line x1="${X}" y1="${hy}" x2="${tx}" y2="${hy}" stroke="#333" stroke-width="1.6"/><path d="M ${tx} ${hy} A ${w} ${w} 0 0 ${o.nx > 0 ? 1 : 0} ${X} ${ey}" fill="none" stroke="#777" stroke-width="1" stroke-dasharray="3 2"/>`);
      }
    } else if (o.type === 'window' || o.type === 'sliding') {
      if (o.orient === 'h') {
        for (const d of [-2.5, 0, 2.5]) parts.push(`<line x1="${X - half * PX}" y1="${Y + d}" x2="${X + half * PX}" y2="${Y + d}" stroke="#1976d2" stroke-width="1.4"/>`);
        if (o.type === 'sliding') parts.push(`<line x1="${X}" y1="${Y - 5}" x2="${X}" y2="${Y + 5}" stroke="#1976d2" stroke-width="1.4"/>`);
      } else {
        for (const d of [-2.5, 0, 2.5]) parts.push(`<line x1="${X + d}" y1="${Y - half * PX}" x2="${X + d}" y2="${Y + half * PX}" stroke="#1976d2" stroke-width="1.4"/>`);
      }
    }
    // תווית פתח
    if (o.tag) {
      const lx = o.orient === 'h' ? X : X + o.nx * -14;
      const ly = o.orient === 'h' ? Y + o.ny * -12 : Y;
      parts.push(`<text x="${lx}" y="${ly + 3}" font-size="9" text-anchor="middle" fill="#0d47a1">${esc(o.tag)}</text>`);
    }
  }
  // שמות חללים ושטחים (באדריכלות)
  for (const r of model.rooms) {
    if (r.type === 'stairs' || !arch) {
      if (!arch && r.type !== 'stairs') parts.push(`<text x="${px(r.x + r.w / 2)}" y="${px(r.y + r.h / 2) + 28}" font-size="10" text-anchor="middle" fill="#9e9e9e">${esc(r.name)}</text>`);
      if (r.type === 'stairs') parts.push(`<text x="${px(r.x + r.w / 2)}" y="${px(r.y + 0.6)}" font-size="12" text-anchor="middle" fill="#455a64" font-weight="700">${esc(r.name)}</text>`);
      continue;
    }
    const area = r.w * r.h;
    const cx = px(r.x + r.w / 2), cy = px(r.y + r.h / 2);
    parts.push(`<text x="${cx}" y="${cy - 2}" font-size="${r.w * PX < 110 ? 10 : 13}" text-anchor="middle" font-weight="700" fill="#222">${esc(r.name)}</text><text x="${cx}" y="${cy + 14}" font-size="${r.w * PX < 110 ? 9 : 11}" text-anchor="middle" fill="#555">${area.toFixed(2)} מ"ר</text>`);
  }
  // אביזרים
  if (!arch) {
    for (const f of model.fixtures) {
      const isE = ['socket', 'switch', 'light', 'panel', 'data', 'tv', 'ac', 'intercom'].includes(f.kind);
      if ((discipline === 'electrical') === isE) parts.push(symbol(f.kind, px(f.x), px(f.y)));
    }
    // ציר צנרת מרכזי (דקורטיבי) באינסטלציה
    if (discipline === 'plumbing') {
      for (const a of model.apts) {
        const bath = a.rooms.find((r) => r.key === 'bath'), laundry = a.rooms.find((r) => r.key === 'laundry');
        const sh = a.fixtures.find((f) => f.room === bath.id && f.kind === 'shower');
        const sk = a.fixtures.find((f) => f.room === bath.id && f.kind === 'sink');
        parts.push(`<line x1="${px(sk.x)}" y1="${px(sk.y)}" x2="${px(sh.x)}" y2="${px(sk.y)}" stroke="#1565c0" stroke-width="1.5" stroke-dasharray="6 3"/>`);
        const w = a.fixtures.find((f) => f.room === laundry.id && f.kind === 'washer');
        const dr = a.fixtures.find((f) => f.room === laundry.id && f.kind === 'drain');
        parts.push(`<line x1="${px(w.x)}" y1="${px(w.y)}" x2="${px(dr.x)}" y2="${px(dr.y)}" stroke="#c62828" stroke-width="1.5" stroke-dasharray="6 3"/>`);
      }
    }
  }
  // קווי מידות
  const dimY = px(model.totalH) + 28;
  const dimLine = (x0, x1, y, label) => `<g stroke="#444" stroke-width="1"><line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/><line x1="${x0}" y1="${y - 5}" x2="${x0}" y2="${y + 5}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/></g><text x="${(x0 + x1) / 2}" y="${y - 5}" font-size="11" text-anchor="middle" fill="#333">${label}</text>`;
  parts.push(dimLine(px(0), px(model.Wa), dimY, model.Wa.toFixed(2)));
  parts.push(dimLine(px(model.Wa), px(model.Wa + model.coreW), dimY, model.coreW.toFixed(2)));
  parts.push(dimLine(px(model.Wa + model.coreW), px(model.totalW), dimY, model.Wa.toFixed(2)));
  parts.push(dimLine(px(0), px(model.totalW), dimY + 22, model.totalW.toFixed(2)));
  // שם דירה
  model.apts.forEach((a, i) => {
    const x0 = i === 0 ? 0 : model.Wa + model.coreW;
    parts.push(`<text x="${px(x0 + model.Wa / 2)}" y="${MARGIN - 22}" font-size="16" font-weight="700" text-anchor="middle" fill="#1b5e20">${esc(aptNames[i])}</text>`);
  });
  // מקרא בתכניות חשמל/אינסטלציה
  if (!arch) {
    const kinds = discipline === 'electrical'
      ? [['socket', 'שקע'], ['switch', 'מפסק'], ['light', 'נקודת תאורה'], ['panel', 'לוח חשמל'], ['data', 'תקשורת'], ['tv', 'טלוויזיה'], ['ac', 'מזגן'], ['intercom', 'אינטרקום']]
      : [['toilet', 'אסלה'], ['sink', 'כיור'], ['shower', 'מקלחון'], ['kitchen_sink', 'כיור מטבח'], ['dishwasher', 'מדיח'], ['washer', 'מכונת כביסה'], ['boiler', 'דוד'], ['drain', 'ניקוז'], ['tap', 'ברז']];
    parts.push(`<text x="${MARGIN}" y="${H - 78}" font-size="11" font-weight="700" fill="#333">מקרא:</text>`);
    kinds.forEach(([k, lbl], i) => {
      const bx = MARGIN + 60 + i * 92, by = H - 82;
      parts.push(`<g transform="translate(${bx},${by}) scale(.8)">${symbol(k, 0, 0)}</g><text x="${bx + 14}" y="${by + 4}" font-size="10" fill="#333">${esc(lbl)}</text>`);
    });
  }
  // חותמת
  const tbY = H - 58;
  parts.push(`<rect x="${MARGIN}" y="${tbY}" width="${W - 2 * MARGIN}" height="46" fill="none" stroke="#333" stroke-width="1.5"/>`);
  parts.push(`<text x="${W - MARGIN - 10}" y="${tbY + 19}" font-size="14" font-weight="700" text-anchor="end" fill="#111">${esc(projectName)} – ${esc(title)}</text>`);
  parts.push(`<text x="${W - MARGIN - 10}" y="${tbY + 37}" font-size="11" text-anchor="end" fill="#444">${esc(floorLabel)} | קנה מידה 1:50</text>`);
  parts.push(`<g transform="translate(${MARGIN + 14},${tbY + 28})"><line x1="0" y1="0" x2="${2 * PX}" y2="0" stroke="#111" stroke-width="3"/><line x1="0" y1="-5" x2="0" y2="5" stroke="#111"/><line x1="${PX}" y1="-5" x2="${PX}" y2="5" stroke="#111"/><line x1="${2 * PX}" y1="-5" x2="${2 * PX}" y2="5" stroke="#111"/><text x="0" y="-9" font-size="9" text-anchor="middle">0</text><text x="${PX}" y="-9" font-size="9" text-anchor="middle">1</text><text x="${2 * PX}" y="-9" font-size="9" text-anchor="middle">2 מ'</text></g>`);
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, 'Segoe UI', sans-serif" direction="rtl">${parts.join('')}</svg>`;
  return { svg, W, H, px };
}

export function buildAnalysis({ model, W, H, px, unitIds, discipline }) {
  const n = (mx, my) => [Math.round((px(mx) / W) * 100000) / 100000, Math.round((px(my) / H) * 100000) / 100000];
  const rooms = model.rooms.map((r) => ({
    id: r.id, name: r.name, type: r.type, unitId: r.unitIdx === null ? null : unitIds[r.unitIdx],
    polygon: [n(r.x, r.y), n(r.x + r.w, r.y), n(r.x + r.w, r.y + r.h), n(r.x, r.y + r.h)],
  }));
  const a = { version: 1, source: 'seed', rooms, openings: [], fixtures: [] };
  if (discipline === 'architecture') {
    a.openings = model.openings.map((o) => {
      const [x, y] = n(o.cx, o.cy);
      return { id: o.id, type: o.type, x, y, wM: o.w, hM: o.h, sillM: o.sill || undefined, room: o.room, tag: o.tag };
    });
    a.summary = 'תכנית אדריכלות לדוגמה: שתי דירות וחדר מדרגות מרכזי.';
  } else {
    a.fixtures = model.fixtures
      .filter((f) => (discipline === 'electrical') === ['socket', 'switch', 'light', 'panel', 'data', 'tv', 'ac', 'intercom'].includes(f.kind))
      .map((f) => {
        const [x, y] = n(f.x, f.y);
        return { id: f.id, kind: f.kind, x, y, room: f.room, unitId: unitIds[f.unitIdx] };
      });
    a.summary = discipline === 'electrical' ? 'תכנית חשמל לדוגמה.' : 'תכנית אינסטלציה לדוגמה.';
  }
  return a;
}

// חזית וחתך פשוטים (ללא ניתוח כמותי)
export function renderElevation({ projectName, totalW, floors, sx }) {
  const FH = 2.9, W = Math.round(totalW * PX + 160), flrs = floors;
  const H = Math.round((flrs * FH + 1.5) * PX + 150);
  const base = H - 90;
  const parts = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  parts.push(`<line x1="40" y1="${base}" x2="${W - 40}" y2="${base}" stroke="#222" stroke-width="3"/>`);
  parts.push(`<rect x="80" y="${base - flrs * FH * PX}" width="${totalW * PX}" height="${flrs * FH * PX}" fill="#f5f0e6" stroke="#222" stroke-width="3"/>`);
  for (let f = 0; f < flrs; f++) {
    const y0 = base - (f + 1) * FH * PX;
    parts.push(`<line x1="80" y1="${y0}" x2="${80 + totalW * PX}" y2="${y0}" stroke="#222" stroke-width="1.5"/>`);
    for (let i = 0; i < 7; i++) {
      const x = 80 + (0.8 + i * (totalW - 1.6) / 6.4) * PX;
      parts.push(`<rect x="${x}" y="${y0 + 0.8 * PX}" width="${1.3 * PX}" height="${1.2 * PX}" fill="#bbdefb" stroke="#1565c0" stroke-width="1.5"/>`);
    }
    parts.push(`<text x="40" y="${y0 + FH * PX - 8}" font-size="11" fill="#444">+${(f * FH).toFixed(2)}</text>`);
  }
  parts.push(`<text x="${W / 2}" y="${H - 40}" font-size="15" font-weight="700" text-anchor="middle">${esc(projectName)} – חזית קדמית (1:50)</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif">${parts.join('')}</svg>`;
}

export function renderSection({ projectName, totalH, floors }) {
  const FH = 2.9, W = Math.round(totalH * PX + 160);
  const H = Math.round((floors * FH + 1.5) * PX + 150), base = H - 90;
  const parts = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  parts.push(`<line x1="40" y1="${base}" x2="${W - 40}" y2="${base}" stroke="#222" stroke-width="3"/>`);
  for (let f = 0; f <= floors; f++) {
    const y = base - f * FH * PX;
    parts.push(`<rect x="80" y="${y - 6}" width="${totalH * PX}" height="12" fill="#bdbdbd" stroke="#222" stroke-width="1.5"/>`);
    if (f < floors) parts.push(`<text x="${W - 40}" y="${y - FH * PX / 2}" font-size="11" text-anchor="end" fill="#444">גובה נטו 2.60 מ'</text>`);
  }
  parts.push(`<line x1="80" y1="${base}" x2="80" y2="${base - floors * FH * PX}" stroke="#222" stroke-width="6"/><line x1="${80 + totalH * PX}" y1="${base}" x2="${80 + totalH * PX}" y2="${base - floors * FH * PX}" stroke="#222" stroke-width="6"/>`);
  parts.push(`<text x="${W / 2}" y="${H - 40}" font-size="15" font-weight="700" text-anchor="middle">${esc(projectName)} – חתך א-א (1:50)</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif">${parts.join('')}</svg>`;
}
