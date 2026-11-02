import type { ProjectData, PlanMeta } from './types';
import { ROOM_TYPES } from './types';
import { roomMetrics } from './geometry';
import { fixtureRows, openingRows, roomRows, type Scope } from './quantities';

// ⚠ הערכים הם ערכי ייחוס ברירת מחדל הניתנים לעריכה. יש לאמת מול נוסח התקנות/התקנים העדכני לפני הסתמכות.
export interface Params {
  bedroomMinArea: number; masterMinArea: number; salonMinArea: number; kitchenMinArea: number;
  bathMinArea: number; toiletMinArea: number; mamadMinArea: number; roomMinWidth: number;
  entranceMinWidth: number; doorMinWidth: number; wetDoorMinWidth: number;
  windowAreaRatio: number; socketsSalon: number; socketsBedroom: number; socketsKitchen: number;
  bathSocketToShowerM: number; lightPerRoom: number;
}

export const DEFAULT_PARAMS: Params = {
  bedroomMinArea: 9, masterMinArea: 10, salonMinArea: 16, kitchenMinArea: 6,
  bathMinArea: 3.5, toiletMinArea: 1.2, mamadMinArea: 9, roomMinWidth: 2.4,
  entranceMinWidth: 0.9, doorMinWidth: 0.8, wetDoorMinWidth: 0.7,
  windowAreaRatio: 0.1, socketsSalon: 4, socketsBedroom: 3, socketsKitchen: 4,
  bathSocketToShowerM: 0.6, lightPerRoom: 1,
};

export const PARAM_LABELS: Record<keyof Params, string> = {
  bedroomMinArea: 'שטח מינימלי – חדר שינה (מ"ר)', masterMinArea: 'שטח מינימלי – חדר הורים (מ"ר)',
  salonMinArea: 'שטח מינימלי – סלון (מ"ר)', kitchenMinArea: 'שטח מינימלי – מטבח (מ"ר)',
  bathMinArea: 'שטח מינימלי – חדר רחצה (מ"ר)', toiletMinArea: 'שטח מינימלי – שירותים (מ"ר)',
  mamadMinArea: 'שטח פנימי מינימלי – ממ"ד (מ"ר)', roomMinWidth: 'רוחב מינימלי של חדר מגורים (מ\')',
  entranceMinWidth: 'רוחב דלת כניסה מינימלי (מ\')', doorMinWidth: 'רוחב דלת חדר מינימלי (מ\')',
  wetDoorMinWidth: 'רוחב דלת חדר רחצה/שירותים מינימלי (מ\')', windowAreaRatio: 'יחס שטח חלון לשטח רצפה (חדרי מגורים)',
  socketsSalon: 'שקעים מינימליים – סלון', socketsBedroom: 'שקעים מינימליים – חדר שינה',
  socketsKitchen: 'שקעים מינימליים – מטבח', bathSocketToShowerM: 'מרחק מינימלי שקע–מקלחון (מ\')',
  lightPerRoom: 'נקודות תאורה מינימליות לחלל',
};

export interface RuleGroup { id: string; title: string; description: string; source: string }
export const RULE_GROUPS: RuleGroup[] = [
  { id: 'areas', title: 'שטחים ומידות חללים', description: 'שטח ורוחב מינימליים לחדרי מגורים, מטבח, רחצה ושירותים', source: 'תקנות התכנון והבנייה (בקשה להיתר, תנאיו ואגרות) – ערכי ייחוס' },
  { id: 'openings', title: 'דלתות וחלונות', description: 'רוחב דלתות, יחס חלון לרצפה, פתחים בחדרים', source: 'תקנות התכנון והבנייה / ת"י 1918 – ערכי ייחוס' },
  { id: 'mamad', title: 'ממ"ד', description: 'שטח פנימי מינימלי וקיום פתחים', source: 'תקנות ההתגוננות האזרחית (מרחבים מוגנים) – ערכי ייחוס' },
  { id: 'electric', title: 'חשמל', description: 'כמות שקעים/תאורה, מרחקי בטיחות באזורים רטובים, לוח חשמל', source: 'חוק החשמל, ת"י 61 / ת"י 1555 – ערכי ייחוס' },
  { id: 'plumbing', title: 'אינסטלציה', description: 'התאמת אביזרי מים לחללים רטובים, ניקוז, מים חמים', source: 'ת"י 1205 והתקנות הסניטריות – ערכי ייחוס' },
];

export type Severity = 'fail' | 'warn' | 'pass';
export interface Finding {
  ruleId: string; group: string; severity: Severity; title: string; detail: string;
  planId?: number; x?: number; y?: number; unitName?: string; roomName?: string;
}

const dist = (plan: PlanMeta, ax: number, ay: number, bx: number, by: number) =>
  Math.hypot((ax - bx) * plan.width, (ay - by) * plan.height) * (plan.mpp || 0);

export function runChecks(d: ProjectData, groups: string[], P: Params, scope: Scope = {}): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const rows = roomRows(d, scope);
  const planOf = (id: number) => d.plans.find((p) => p.id === id)!;
  const polyCenter = (planId: number, roomId: string) => {
    const r = planOf(planId).analysis!.rooms.find((x) => x.id === roomId)!;
    const n = r.polygon.length;
    return [r.polygon.reduce((a, p) => a + p[0], 0) / n, r.polygon.reduce((a, p) => a + p[1], 0) / n];
  };

  if (groups.includes('areas')) {
    const limits: Record<string, number> = { bedroom: P.bedroomMinArea, master: P.masterMinArea, salon: P.salonMinArea, kitchen: P.kitchenMinArea, bath: P.bathMinArea, toilet: P.toiletMinArea };
    for (const r of rows) {
      const lim = limits[r.type];
      if (lim === undefined) continue;
      const [cx, cy] = polyCenter(r.planId, r.roomId);
      const ok = r.areaM2 + 1e-6 >= lim;
      add({ ruleId: 'AREA-' + r.type, group: 'areas', severity: ok ? 'pass' : 'fail', title: `שטח ${r.typeLabel}`,
        detail: `${r.unitName} / ${r.name}: ${r.areaM2.toFixed(2)} מ"ר (נדרש לפחות ${lim})`, planId: r.planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
      if (['bedroom', 'master', 'salon'].includes(r.type)) {
        const okW = r.widthM + 1e-6 >= P.roomMinWidth;
        add({ ruleId: 'WIDTH-' + r.type, group: 'areas', severity: okW ? 'pass' : 'fail', title: `רוחב ${r.typeLabel}`,
          detail: `${r.unitName} / ${r.name}: רוחב ${r.widthM.toFixed(2)} מ' (נדרש לפחות ${P.roomMinWidth})`, planId: r.planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
      }
    }
  }

  const ops = openingRows(d, scope);
  if (groups.includes('openings')) {
    for (const o of ops) {
      const t = o.opening.type;
      const room = planOf(o.planId).analysis!.rooms.find((r) => r.name === o.roomName);
      const wet = room && ['bath', 'toilet', 'laundry', 'storage'].includes(room.type);
      let lim = 0, label = '';
      if (t === 'entrance') { lim = P.entranceMinWidth; label = 'דלת כניסה'; }
      else if (t === 'door') { lim = wet ? P.wetDoorMinWidth : P.doorMinWidth; label = wet ? 'דלת חדר רחצה/שירותים' : 'דלת חדר'; }
      else continue;
      const ok = o.opening.wM + 1e-6 >= lim;
      add({ ruleId: 'DOOR-' + t, group: 'openings', severity: ok ? 'pass' : 'fail', title: `רוחב ${label}`,
        detail: `${o.unitName} / ${o.roomName}${o.opening.tag ? ' (' + o.opening.tag + ')' : ''}: ${o.opening.wM.toFixed(2)} מ' (נדרש ≥ ${lim})`, planId: o.planId, x: o.opening.x, y: o.opening.y, unitName: o.unitName, roomName: o.roomName });
    }
    // יחס חלון לרצפה
    for (const r of rows.filter((x) => ['salon', 'bedroom', 'master', 'kitchen', 'mamad'].includes(x.type))) {
      const winArea = ops.filter((o) => o.planId === r.planId && o.opening.room === r.roomId && (o.opening.type === 'window' || o.opening.type === 'sliding'))
        .reduce((a, o) => a + o.opening.wM * (o.opening.hM ?? 1.2), 0);
      const ratio = winArea / r.areaM2;
      const [cx, cy] = polyCenter(r.planId, r.roomId);
      add({ ruleId: 'WIN-' + r.type, group: 'openings', severity: ratio + 1e-6 >= P.windowAreaRatio ? 'pass' : winArea === 0 ? 'fail' : 'warn',
        title: `שטח חלונות ביחס לרצפה – ${r.typeLabel}`, detail: `${r.unitName} / ${r.name}: ${(ratio * 100).toFixed(1)}% (נדרש ≥ ${(P.windowAreaRatio * 100).toFixed(0)}%)`, planId: r.planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
    }
    // חדרים רטובים ללא חלון – דורשים אוורור מכני
    for (const r of rows.filter((x) => ['bath', 'toilet'].includes(x.type))) {
      const hasWin = ops.some((o) => o.planId === r.planId && o.opening.room === r.roomId && o.opening.type === 'window');
      if (!hasWin) {
        const [cx, cy] = polyCenter(r.planId, r.roomId);
        add({ ruleId: 'VENT-' + r.type, group: 'openings', severity: 'warn', title: `אוורור – ${r.typeLabel}`, detail: `${r.unitName} / ${r.name}: אין חלון בתכנית. נדרש לוודא פיר/אוורור מכני.`, planId: r.planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
      }
    }
  }

  if (groups.includes('mamad')) {
    for (const r of rows.filter((x) => x.type === 'mamad')) {
      const [cx, cy] = polyCenter(r.planId, r.roomId);
      add({ ruleId: 'MAMAD-AREA', group: 'mamad', severity: r.areaM2 + 1e-6 >= P.mamadMinArea ? 'pass' : 'fail', title: 'שטח ממ"ד',
        detail: `${r.unitName}: ${r.areaM2.toFixed(2)} מ"ר (נדרש ≥ ${P.mamadMinArea})`, planId: r.planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
      const doors = ops.filter((o) => o.planId === r.planId && o.opening.room === r.roomId && (o.opening.type === 'door' || o.opening.type === 'entrance'));
      add({ ruleId: 'MAMAD-DOOR', group: 'mamad', severity: doors.length === 1 ? 'pass' : 'warn', title: 'דלת ממ"ד',
        detail: `${r.unitName}: נמצאו ${doors.length} דלתות בממ"ד (צפוי 1 – דלת מגן)`, planId: r.planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
    }
    if (!rows.some((x) => x.type === 'mamad') && rows.length)
      add({ ruleId: 'MAMAD-MISSING', group: 'mamad', severity: 'warn', title: 'ממ"ד', detail: 'לא זוהה ממ"ד בתכניות האדריכלות שבהיקף שנבחר.' });
  }

  if (groups.includes('electric')) {
    const el = fixtureRows(d, 'electrical', scope);
    for (const r of rows.filter((x) => !['corridor', 'stairs', 'entry'].includes(x.type))) {
      const inRoom = (planDisc: string) => el.filter((f) => f.unitId === r.unitId && f.roomName === r.name);
      const mine = inRoom('electrical');
      const sockets = mine.filter((f) => f.fixture.kind.startsWith('socket')).length;
      const lights = mine.filter((f) => f.fixture.kind === 'light').length;
      const planId = mine[0]?.planId ?? r.planId;
      const [cx, cy] = polyCenter(r.planId, r.roomId);
      const need = r.type === 'salon' ? P.socketsSalon : r.type === 'kitchen' ? P.socketsKitchen : ['bedroom', 'master', 'mamad'].includes(r.type) ? P.socketsBedroom : 0;
      if (need) add({ ruleId: 'EL-SOCK-' + r.type, group: 'electric', severity: sockets >= need ? 'pass' : 'fail', title: `שקעים – ${r.typeLabel}`,
        detail: `${r.unitName} / ${r.name}: ${sockets} שקעים (נדרשים לפחות ${need})`, planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
      if (el.length) add({ ruleId: 'EL-LIGHT', group: 'electric', severity: lights >= P.lightPerRoom ? 'pass' : 'fail', title: `תאורה – ${r.typeLabel}`,
        detail: `${r.unitName} / ${r.name}: ${lights} נקודות תאורה (נדרש ≥ ${P.lightPerRoom})`, planId, x: cx, y: cy, unitName: r.unitName, roomName: r.name });
    }
    // שקע ליד מקלחון
    const pl = fixtureRows(d, 'plumbing', scope).filter((f) => f.fixture.kind === 'shower' || f.fixture.kind === 'bathtub');
    for (const sh of pl) {
      const near = el.filter((f) => f.fixture.kind.startsWith('socket') && f.floorId === sh.floorId && f.unitId === sh.unitId && f.roomName === sh.roomName);
      for (const s of near) {
        const p = planOf(s.planId);
        const dm = dist(p, s.fixture.x, s.fixture.y, sh.fixture.x, sh.fixture.y);
        if (dm < P.bathSocketToShowerM)
          add({ ruleId: 'EL-ZONE', group: 'electric', severity: 'fail', title: 'שקע סמוך למקלחון/אמבטיה', detail: `${s.unitName} / ${s.roomName}: שקע במרחק ${dm.toFixed(2)} מ' מהמקלחון (נדרש ≥ ${P.bathSocketToShowerM}).`, planId: s.planId, x: s.fixture.x, y: s.fixture.y, unitName: s.unitName, roomName: s.roomName });
      }
    }
    // לוח חשמל בכל דירה
    const units = new Set(rows.filter((r) => r.unitId).map((r) => r.unitId));
    for (const uid of units) {
      const has = el.some((f) => f.unitId === uid && f.fixture.kind === 'panel');
      const un = d.units.find((u) => u.id === uid)?.name ?? '';
      if (el.length) add({ ruleId: 'EL-PANEL', group: 'electric', severity: has ? 'pass' : 'fail', title: 'לוח חשמל דירתי', detail: `${un}: ${has ? 'זוהה לוח חשמל' : 'לא זוהה לוח חשמל בתכנית החשמל'}`, unitName: un });
    }
    if (!el.length) add({ ruleId: 'EL-NONE', group: 'electric', severity: 'warn', title: 'חשמל', detail: 'אין נתוני חשמל מנותחים בהיקף שנבחר – נתחו תכנית חשמל תחילה.' });
  }

  if (groups.includes('plumbing')) {
    const pl = fixtureRows(d, 'plumbing', scope);
    const wetTypes = new Set(['bath', 'toilet', 'kitchen', 'laundry', 'balcony']);
    const wetKinds = new Set(['toilet', 'sink', 'shower', 'bathtub', 'kitchen_sink', 'washer', 'dishwasher']);
    for (const f of pl) {
      const room = planOf(f.planId).analysis!.rooms.find((r) => r.name === f.roomName);
      if (!room) continue;
      if (wetKinds.has(f.fixture.kind) && !wetTypes.has(room.type))
        add({ ruleId: 'PL-WETROOM', group: 'plumbing', severity: 'fail', title: 'אביזר אינסטלציה בחלל לא רטוב', detail: `${f.unitName}: ${f.fixture.kind} ב"${f.roomName}" (${ROOM_TYPES[room.type]?.label})`, planId: f.planId, x: f.fixture.x, y: f.fixture.y, unitName: f.unitName, roomName: f.roomName });
      if (f.fixture.kind === 'drain' && !wetTypes.has(room.type))
        add({ ruleId: 'PL-DRAIN', group: 'plumbing', severity: 'fail', title: 'ניקוז רצפה בחלל לא רטוב', detail: `${f.unitName}: נקודת ניקוז ב"${f.roomName}" (${ROOM_TYPES[room.type]?.label}) – חשד לטעות בתכנית`, planId: f.planId, x: f.fixture.x, y: f.fixture.y, unitName: f.unitName, roomName: f.roomName });
    }
    const units = new Set(rows.filter((r) => r.unitId).map((r) => r.unitId));
    for (const uid of units) {
      const un = d.units.find((u) => u.id === uid)?.name ?? '';
      const mine = pl.filter((f) => f.unitId === uid);
      if (!pl.length) break;
      const need: [string, string][] = [['toilet', 'אסלה'], ['shower', 'מקלחון/אמבטיה'], ['kitchen_sink', 'כיור מטבח'], ['boiler', 'דוד/מחמם מים']];
      for (const [k, label] of need) {
        const has = mine.some((f) => f.fixture.kind === k || (k === 'shower' && f.fixture.kind === 'bathtub'));
        add({ ruleId: 'PL-' + k, group: 'plumbing', severity: has ? 'pass' : 'fail', title: label, detail: `${un}: ${has ? 'קיים בתכנית' : 'לא נמצא בתכנית האינסטלציה'}`, unitName: un });
      }
    }
    if (!pl.length) add({ ruleId: 'PL-NONE', group: 'plumbing', severity: 'warn', title: 'אינסטלציה', detail: 'אין נתוני אינסטלציה מנותחים בהיקף שנבחר – נתחו תכנית אינסטלציה תחילה.' });
  }
  return out;
}
