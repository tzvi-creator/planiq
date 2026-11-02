import { FIXTURE_KINDS, OPENING_TYPES, ROOM_TYPES, type PlanMeta, type ProjectData, type Fixture, type Opening, type Room } from './types';
import { pointInPoly, roomMetrics } from './geometry';

export interface Scope { floorId?: number | null; unitId?: number | null }

export interface RoomRow {
  planId: number; planName: string; floorId: number | null; roomId: string; name: string; type: string; typeLabel: string;
  unitId: number | null; unitName: string; areaM2: number; perimeterM: number; widthM: number; lengthM: number;
}
export interface OpeningRow {
  planId: number; floorId: number | null; opening: Opening; roomName: string; unitId: number | null; unitName: string;
}
export interface FixtureRow {
  planId: number; floorId: number | null; fixture: Fixture; roomName: string; unitId: number | null; unitName: string; disc: string;
}

const unitName = (d: ProjectData, id: number | null | undefined) => d.units.find((u) => u.id === id)?.name ?? 'שטח משותף';

function inScope(d: ProjectData, plan: PlanMeta, unitId: number | null | undefined, s: Scope) {
  if (s.floorId && plan.floor_id !== s.floorId) return false;
  if (s.unitId && unitId !== s.unitId) return false;
  return true;
}

export function roomRows(d: ProjectData, s: Scope = {}): RoomRow[] {
  const out: RoomRow[] = [];
  for (const p of d.plans) {
    if (p.discipline !== 'architecture' || p.kind !== 'plan' || !p.analysis) continue;
    for (const r of p.analysis.rooms) {
      if (!inScope(d, p, r.unitId, s)) continue;
      const m = roomMetrics(r, p);
      if (!m) continue;
      out.push({
        planId: p.id, planName: p.name, floorId: p.floor_id, roomId: r.id, name: r.name, type: r.type,
        typeLabel: ROOM_TYPES[r.type]?.label ?? r.type, unitId: r.unitId, unitName: unitName(d, r.unitId),
        areaM2: m.areaM2, perimeterM: m.perimeterM, widthM: m.widthM, lengthM: m.lengthM,
      });
    }
  }
  return out;
}

// שיוך אובייקט נקודתי לחלל ולדירה: לפי השדה, ואחרת לפי נקודה-בתוך-מצולע בתכנית עצמה
function locate(plan: PlanMeta, x: number, y: number, roomId?: string) {
  const rooms = plan.analysis?.rooms ?? [];
  let r: Room | undefined = roomId ? rooms.find((q) => q.id === roomId) : undefined;
  if (!r) r = rooms.find((q) => pointInPoly([x, y], q.polygon));
  return r;
}

export function openingRows(d: ProjectData, s: Scope = {}): OpeningRow[] {
  const out: OpeningRow[] = [];
  for (const p of d.plans) {
    if (p.discipline !== 'architecture' || p.kind !== 'plan' || !p.analysis) continue;
    for (const o of p.analysis.openings) {
      const r = locate(p, o.x, o.y, o.room);
      const uid = r?.unitId ?? null;
      if (!inScope(d, p, uid, s)) continue;
      out.push({ planId: p.id, floorId: p.floor_id, opening: o, roomName: r?.name ?? '—', unitId: uid, unitName: unitName(d, uid) });
    }
  }
  return out;
}

export function fixtureRows(d: ProjectData, disc: 'electrical' | 'plumbing', s: Scope = {}): FixtureRow[] {
  const out: FixtureRow[] = [];
  for (const p of d.plans) {
    if (p.discipline !== disc || !p.analysis) continue;
    for (const f of p.analysis.fixtures) {
      const r = locate(p, f.x, f.y, f.room);
      const uid = f.unitId ?? r?.unitId ?? null;
      if (!inScope(d, p, uid, s)) continue;
      out.push({ planId: p.id, floorId: p.floor_id, fixture: f, roomName: r?.name ?? '—', unitId: uid, unitName: unitName(d, uid), disc });
    }
  }
  return out;
}

export interface OpeningGroup { key: string; typeLabel: string; widthM: number; heightM: number | null; sillM: number | null; tags: string[]; count: number; assumed: boolean; areaM2: number }

export function openingSchedule(rows: OpeningRow[]): OpeningGroup[] {
  const map = new Map<string, OpeningGroup>();
  for (const r of rows) {
    const o = r.opening;
    const key = [o.type, o.wM.toFixed(2), o.hM?.toFixed(2) ?? '', o.sillM?.toFixed(2) ?? ''].join('|');
    let g = map.get(key);
    if (!g) {
      g = { key, typeLabel: OPENING_TYPES[o.type] ?? o.type, widthM: o.wM, heightM: o.hM ?? null, sillM: o.sillM ?? null, tags: [], count: 0, assumed: !!o.assumed, areaM2: 0 };
      map.set(key, g);
    }
    g.count++;
    g.areaM2 += o.wM * (o.hM ?? 0);
    if (o.tag && !g.tags.includes(o.tag)) g.tags.push(o.tag);
  }
  return [...map.values()].sort((a, b) => a.typeLabel.localeCompare(b.typeLabel, 'he') || a.widthM - b.widthM);
}

export interface FixtureCount { kind: string; label: string; counts: Record<string, number>; total: number }

// טבלת כמויות: שורה לכל סוג אביזר, עמודה לכל חלל/דירה (לפי groupBy)
export function fixtureTable(rows: FixtureRow[], groupBy: 'room' | 'unit'): { cols: string[]; table: FixtureCount[] } {
  const cols = [...new Set(rows.map((r) => (groupBy === 'room' ? r.roomName : r.unitName)))];
  const byKind = new Map<string, FixtureCount>();
  for (const r of rows) {
    const k = r.fixture.kind;
    if (!byKind.has(k)) byKind.set(k, { kind: k, label: FIXTURE_KINDS[k]?.label ?? k, counts: {}, total: 0 });
    const row = byKind.get(k)!;
    const c = groupBy === 'room' ? r.roomName : r.unitName;
    row.counts[c] = (row.counts[c] || 0) + 1;
    row.total++;
  }
  return { cols, table: [...byKind.values()].sort((a, b) => b.total - a.total) };
}

export function summarize(d: ProjectData, s: Scope = {}, wallHeightM = 2.5) {
  const rooms = roomRows(d, s);
  const openings = openingRows(d, s);
  const total = rooms.filter((r) => r.type !== 'stairs').reduce((a, r) => a + r.areaM2, 0);
  const wallGross = rooms.filter((r) => r.type !== 'stairs').reduce((a, r) => a + r.perimeterM * wallHeightM, 0);
  const openingsArea = openings.filter((o) => o.opening.type !== 'other').reduce((a, o) => a + o.opening.wM * (o.opening.hM ?? 0), 0);
  return {
    roomCount: rooms.length,
    totalAreaM2: total,
    perimeterTotalM: rooms.reduce((a, r) => a + r.perimeterM, 0),
    wallAreaGrossM2: wallGross,
    openingsAreaM2: openingsArea,
    doors: openings.filter((o) => o.opening.type === 'door' || o.opening.type === 'entrance').length,
    windows: openings.filter((o) => o.opening.type === 'window' || o.opening.type === 'sliding').length,
    sockets: fixtureRows(d, 'electrical', s).filter((f) => f.fixture.kind.startsWith('socket')).length,
    electricalPoints: fixtureRows(d, 'electrical', s).length,
    plumbingPoints: fixtureRows(d, 'plumbing', s).length,
  };
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
