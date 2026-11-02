import type { PlanMeta, Pt } from './types';
import { FIXTURE_KINDS, ROOM_TYPES } from './types';
import { pointInPoly } from './geometry';

export interface Align { b1?: Pt; o1?: Pt; b2?: Pt; o2?: Pt }

// מטריצת דמיון: base_px = [a -b; b a] * ov_px + [e f]
export interface Mat { a: number; b: number; e: number; f: number }

export function alignMatrix(base: PlanMeta, ov: PlanMeta, al: Align | undefined): Mat {
  const s = base.mpp && ov.mpp ? ov.mpp / base.mpp : 1;
  const bp = (p: Pt) => [p[0] * base.width, p[1] * base.height];
  const op = (p: Pt) => [p[0] * ov.width, p[1] * ov.height];
  if (al?.b1 && al.o1 && al.b2 && al.o2) {
    const [b1x, b1y] = bp(al.b1), [b2x, b2y] = bp(al.b2), [o1x, o1y] = op(al.o1), [o2x, o2y] = op(al.o2);
    const zx = o2x - o1x, zy = o2y - o1y, wx = b2x - b1x, wy = b2y - b1y;
    const d = zx * zx + zy * zy || 1;
    const a = (wx * zx + wy * zy) / d, b = (wy * zx - wx * zy) / d;
    return { a, b, e: b1x - (a * o1x - b * o1y), f: b1y - (b * o1x + a * o1y) };
  }
  if (al?.b1 && al.o1) {
    const [b1x, b1y] = bp(al.b1), [o1x, o1y] = op(al.o1);
    return { a: s, b: 0, e: b1x - s * o1x, f: b1y - s * o1y };
  }
  // ללא נקודות: אם אותו גודל וקנה מידה – זהות; אחרת מרכוז
  if (base.width === ov.width && base.height === ov.height && Math.abs(s - 1) < 0.01) return { a: 1, b: 0, e: 0, f: 0 };
  return { a: s, b: 0, e: base.width / 2 - (s * ov.width) / 2, f: base.height / 2 - (s * ov.height) / 2 };
}

export const applyMat = (m: Mat, x: number, y: number): [number, number] => [m.a * x - m.b * y + m.e, m.b * x + m.a * y + m.f];
export function invertMat(m: Mat): Mat {
  const d = m.a * m.a + m.b * m.b || 1;
  const a = m.a / d, b = -m.b / d;
  return { a, b, e: -(a * m.e - b * m.f), f: -(b * m.e + a * m.f) };
}
// נקודה מנורמלת של שכבה => מנורמלת של בסיס
export function ovToBase(m: Mat, ov: PlanMeta, base: PlanMeta, p: Pt): Pt {
  const [x, y] = applyMat(m, p[0] * ov.width, p[1] * ov.height);
  return [x / base.width, y / base.height];
}

export interface Conflict {
  id: string;
  severity: 'fail' | 'warn';
  title: string;
  detail: string;
  x: number; // מנורמל במערכת הבסיס
  y: number;
  planIds: number[];
  source: 'auto' | 'ai';
}

const WET = new Set(['bath', 'toilet', 'kitchen', 'laundry', 'balcony']);
const WET_KINDS = new Set(['toilet', 'sink', 'shower', 'bathtub', 'kitchen_sink', 'washer', 'dishwasher', 'drain', 'tap', 'boiler']);

function distToPoly(p: Pt, poly: Pt[], W: number, H: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const px = p[0] * W, py = p[1] * H, x1 = ax * W, y1 = ay * H, x2 = bx * W, y2 = by * H;
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)));
  }
  return best;
}

export interface LayerIn { plan: PlanMeta; mat: Mat }

export function detectConflicts(base: PlanMeta, layers: LayerIn[]): Conflict[] {
  const out: Conflict[] = [];
  if (!base.analysis || !base.mpp) return out;
  const { width: W, height: H, mpp } = base;
  const rooms = base.analysis.rooms, openings = base.analysis.openings;
  const mDist = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H) * mpp;
  const roomAt = (p: Pt) => rooms.find((r) => pointInPoly(p, r.polygon));
  let n = 0;
  const add = (c: Omit<Conflict, 'id' | 'source'>) => out.push({ ...c, id: 'c' + ++n, source: 'auto' });

  type Item = { kind: string; p: Pt; plan: PlanMeta; disc: string };
  const items: Item[] = [];
  const elems: { type: string; poly: Pt[]; plan: PlanMeta }[] = [];
  for (const L of layers) {
    for (const f of L.plan.analysis?.fixtures ?? []) items.push({ kind: f.kind, p: ovToBase(L.mat, L.plan, base, [f.x, f.y]), plan: L.plan, disc: L.plan.discipline });
    for (const e of L.plan.analysis?.elements ?? []) elems.push({ type: e.type, poly: e.polygon.map((q) => ovToBase(L.mat, L.plan, base, q)), plan: L.plan });
  }
  const label = (k: string) => FIXTURE_KINDS[k]?.label ?? k;

  for (const it of items) {
    const room = roomAt(it.p);
    // 1. מחוץ לחלל / בתוך קיר
    if (!room) {
      const d = Math.min(...rooms.map((r) => distToPoly(it.p, r.polygon, W, H))) * mpp;
      if (d > 0.3) add({ severity: 'fail', title: 'אביזר מחוץ לחללי התכנית האדריכלית', detail: `${label(it.kind)} (${it.plan.name}) נמצא ${d.toFixed(2)} מ' מחוץ לכל חלל – ייתכן שהוא בתוך קיר, מחוץ לבניין או שהתכניות אינן מיושרות.`, x: it.p[0], y: it.p[1], planIds: [base.id, it.plan.id] });
      continue;
    }
    // 2. בתוך פתח
    // (תאורה תקרתית, מזגן וברזי גן אינם מתנגשים בדלתות; חלונות – אביזרים מתחתיהם תקינים)
    if (!['light', 'ac', 'tap'].includes(it.kind)) {
      for (const o of openings) {
        if (o.type === 'window') continue;
        const d = mDist(it.p, [o.x, o.y]);
        if (d < Math.min(o.wM / 2 + 0.15, 0.65)) {
          add({ severity: 'fail', title: 'אביזר בתוך פתח דלת', detail: `${label(it.kind)} (${it.plan.name}) ב"${room.name}" נמצא על דלת${o.tag ? ' ' + o.tag : ''} (מרחק ${d.toFixed(2)} מ' ממרכז הפתח).`, x: it.p[0], y: it.p[1], planIds: [base.id, it.plan.id] });
          break;
        }
      }
    }
    // 3. אביזר מים בחלל לא רטוב
    if (it.disc === 'plumbing' && WET_KINDS.has(it.kind) && !WET.has(room.type)) {
      add({ severity: 'fail', title: 'אביזר אינסטלציה בחלל לא רטוב', detail: `${label(it.kind)} נמצא ב"${room.name}" (${ROOM_TYPES[room.type]?.label}) – בניגוד לייעוד החלל באדריכלות.`, x: it.p[0], y: it.p[1], planIds: [base.id, it.plan.id] });
    }
  }
  // 4. שקע סמוך למקלחון/אמבטיה (בין תכניות)
  const wetPts = items.filter((i) => i.disc === 'plumbing' && (i.kind === 'shower' || i.kind === 'bathtub'));
  for (const s of items.filter((i) => i.disc === 'electrical' && i.kind.startsWith('socket'))) {
    for (const w of wetPts) {
      const d = mDist(s.p, w.p);
      if (d < 0.6) { add({ severity: 'fail', title: 'שקע חשמל בתוך אזור רטוב של מקלחון/אמבטיה', detail: `שקע במרחק ${d.toFixed(2)} מ' ממקלחון/אמבטיה (נדרש ≥ 0.60 מ' בערכי הייחוס).`, x: s.p[0], y: s.p[1], planIds: [s.plan.id, w.plan.id] }); break; }
    }
  }
  // 5. קונסטרוקציה
  for (const e of elems) {
    const c: Pt = [e.poly.reduce((a, p) => a + p[0], 0) / e.poly.length, e.poly.reduce((a, p) => a + p[1], 0) / e.poly.length];
    for (const o of openings) {
      if (mDist(c, [o.x, o.y]) < o.wM / 2 + 0.1) add({ severity: 'fail', title: 'אלמנט קונסטרוקטיבי חוסם פתח', detail: `${e.type === 'column' ? 'עמוד' : e.type === 'beam' ? 'קורה' : 'קיר'} (${e.plan.name}) חופף ל${o.type === 'window' ? 'חלון' : 'דלת'}${o.tag ? ' ' + o.tag : ''}.`, x: c[0], y: c[1], planIds: [base.id, e.plan.id] });
    }
    for (const it of items) if (pointInPoly(it.p, e.poly)) add({ severity: 'fail', title: 'אביזר בתוך אלמנט קונסטרוקטיבי', detail: `${label(it.kind)} (${it.plan.name}) נמצא בתוך ${e.type === 'column' ? 'עמוד' : e.type === 'beam' ? 'קורה' : 'קיר'} (${e.plan.name}).`, x: it.p[0], y: it.p[1], planIds: [it.plan.id, e.plan.id] });
  }
  // 6. חפיפה בין חשמל לאינסטלציה
  const el = items.filter((i) => i.disc === 'electrical'), pl = items.filter((i) => i.disc === 'plumbing');
  for (const a of el) for (const b of pl) if (mDist(a.p, b.p) < 0.1) add({ severity: 'warn', title: 'חפיפה בין אביזר חשמל לאינסטלציה', detail: `${label(a.kind)} ו${label(b.kind)} באותו מיקום (מרחק ${mDist(a.p, b.p).toFixed(2)} מ').`, x: a.p[0], y: a.p[1], planIds: [a.plan.id, b.plan.id] });
  return out;
}
