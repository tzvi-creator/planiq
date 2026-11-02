import type { Pt, PlanMeta, Room } from './types';

export function polyAreaPx(poly: Pt[], W: number, H: number): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * W * (y2 * H) - x2 * W * (y1 * H);
  }
  return Math.abs(s) / 2;
}

export function polyPerimeterPx(poly: Pt[], W: number, H: number): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    p += Math.hypot((x2 - x1) * W, (y2 - y1) * H);
  }
  return p;
}

export function bboxPx(poly: Pt[], W: number, H: number) {
  const xs = poly.map((p) => p[0] * W);
  const ys = poly.map((p) => p[1] * H);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isRect(poly: Pt[]): boolean {
  if (poly.length !== 4) return false;
  const xs = new Set(poly.map((p) => p[0].toFixed(3)));
  const ys = new Set(poly.map((p) => p[1].toFixed(3)));
  return xs.size === 2 && ys.size === 2;
}

export interface RoomMetrics {
  areaM2: number;
  perimeterM: number;
  widthM: number; // צלע קצרה של תיבת הגבול
  lengthM: number; // צלע ארוכה
  rect: boolean;
}

type ScaleInfo = Pick<PlanMeta, 'width' | 'height' | 'mpp'>;

export function roomMetrics(room: Room, plan: ScaleInfo): RoomMetrics | null {
  if (!plan.mpp) return null;
  const { width: W, height: H, mpp } = plan;
  const b = bboxPx(room.polygon, W, H);
  const dims = [b.w * mpp, b.h * mpp].sort((a, c) => a - c);
  return {
    areaM2: polyAreaPx(room.polygon, W, H) * mpp * mpp,
    perimeterM: polyPerimeterPx(room.polygon, W, H) * mpp,
    widthM: dims[0],
    lengthM: dims[1],
    rect: isRect(room.polygon),
  };
}

export function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

export function distM(a: Pt, b: Pt, plan: ScaleInfo): number {
  return Math.hypot((a[0] - b[0]) * plan.width, (a[1] - b[1]) * plan.height) * (plan.mpp || 0);
}

export const fmt = (n: number, d = 2) =>
  n.toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
