// זיהוי חללים גיאומטרי מתוך תמונת תכנית (ללא AI):
// 1. הקירות/קווים הכהים = מחסום. 2. מרחק אוקלידי מהמחסום (EDT). 3. "ליבות" חדרים = אזורים רחוקים מספיק מקירות
//    (רדיוס גדול מחצי רוחב דלת, כך שפתחי דלתות לא מחברים חדרים). 4. הגדלת הליבות בתוך החלל הפנוי.
// 5. איחוד אזורים שנוגעים זה בזה ברוחב גדול (פיצול ע"י ריהוט) 6. חילוץ קווי מתאר ופישוט.
import type { Pt } from './types';

export interface DetectedRegion { poly: Pt[]; areaPx: number; touchesBorder: boolean }
export interface DetectOptions { mpp: number; doorM?: number; minAreaM2?: number; darkThreshold?: number }

const INF = 1e12;

function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// מרחק ריבועי של כל פיקסל פנוי לפיקסל מחסום הקרוב ביותר
function edtSq(barrier: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = barrier[y * w + x] ? 0 : INF;
    dt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    dt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

function simplify(pts: Pt[], eps: number): Pt[] {
  // Douglas-Peucker על מצולע סגור: מפצלים בשתי נקודות רחוקות
  if (pts.length < 5) return pts;
  let a = 0, b = 0, best = -1;
  for (let i = 1; i < pts.length; i++) { const dd = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (dd > best) { best = dd; b = i; } }
  const dp = (arr: Pt[]): Pt[] => {
    if (arr.length < 3) return arr;
    const [x1, y1] = arr[0], [x2, y2] = arr[arr.length - 1];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    let mi = 0, md = 0;
    for (let i = 1; i < arr.length - 1; i++) {
      const dist = Math.abs(dy * arr[i][0] - dx * arr[i][1] + x2 * y1 - y2 * x1) / len;
      if (dist > md) { md = dist; mi = i; }
    }
    if (md > eps) { const l = dp(arr.slice(0, mi + 1)), r = dp(arr.slice(mi)); return [...l.slice(0, -1), ...r]; }
    return [arr[0], arr[arr.length - 1]];
  };
  const first = pts.slice(a, b + 1), second = [...pts.slice(b), pts[a]];
  return [...dp(first).slice(0, -1), ...dp(second).slice(0, -1)];
}

function outline(idx: number[], label: Int32Array, lab: number, w: number, h: number): Pt[] {
  // קצוות גבול כמעגלים מכוונים; בוחרים את הלולאה החיצונית (הגדולה ביותר)
  const next = new Map<number, number[][]>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const k = key(x1, y1);
    const arr = next.get(k);
    if (arr) arr.push([x2, y2, 0]); else next.set(k, [[x2, y2, 0]]);
  };
  for (const i of idx) {
    const x = i % w, y = (i / w) | 0;
    if (y === 0 || label[i - w] !== lab) add(x, y, x + 1, y);
    if (x === w - 1 || label[i + 1] !== lab) add(x + 1, y, x + 1, y + 1);
    if (y === h - 1 || label[i + w] !== lab) add(x + 1, y + 1, x, y + 1);
    if (x === 0 || label[i - 1] !== lab) add(x, y + 1, x, y);
  }
  let bestLoop: Pt[] = [], bestArea = 0;
  for (const [k0, arr0] of next) {
    for (const e0 of arr0) {
      if (e0[2]) continue;
      const loop: Pt[] = [];
      let cx = k0 % (w + 1), cy = (k0 / (w + 1)) | 0;
      let e: number[] | undefined = e0;
      const sx = cx, sy = cy;
      let guard = 0;
      while (e && !e[2] && guard++ < 4_000_000) {
        e[2] = 1;
        loop.push([cx, cy]);
        cx = e[0]; cy = e[1];
        if (cx === sx && cy === sy) break;
        e = next.get(key(cx, cy))?.find((q) => !q[2]);
      }
      let a = 0;
      for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; }
      a = Math.abs(a) / 2;
      if (a > bestArea) { bestArea = a; bestLoop = loop; }
    }
  }
  return bestLoop;
}

export function detectRooms(img: ImageData, opts: DetectOptions): DetectedRegion[] {
  const { width: W0, height: H0, data } = img;
  const doorM = opts.doorM ?? 0.9;
  // קנה מידה לעבודה: ~4 ס"מ לפיקסל (OR-pooling שומר קווים דקים)
  const f = Math.max(1, Math.round(0.04 / opts.mpp));
  const w = Math.ceil(W0 / f), h = Math.ceil(H0 / f);
  const mppW = opts.mpp * f;
  const thr = opts.darkThreshold ?? 150;
  const barrier = new Uint8Array(w * h);
  for (let y = 0; y < H0; y++) {
    for (let x = 0; x < W0; x++) {
      const p = (y * W0 + x) * 4;
      if ((data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11) < thr && data[p + 3] > 20) barrier[((y / f) | 0) * w + ((x / f) | 0)] = 1;
    }
  }
  // הסרת "מלח": פיקסלים כהים בודדים; והעבות קלה לסגירת סדקים
  const sealed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (barrier[y * w + x]) { sealed[y * w + x] = 1; continue; }
    if ((x > 0 && barrier[y * w + x - 1] && x < w - 1 && barrier[y * w + x + 1]) || (y > 0 && barrier[(y - 1) * w + x] && y < h - 1 && barrier[(y + 1) * w + x])) sealed[y * w + x] = 1;
  }

  const dsq = edtSq(sealed, w, h);
  const rSeed = Math.max(2, (doorM / 2 + 0.05) / mppW);
  const seedSq = rSeed * rSeed;

  // ליבות: רכיבים קשירים של פיקסלים רחוקים מספיק מקיר
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let nSeeds = 0;
  const seedSizes: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (label[s] !== -1 || dsq[s] < seedSq) continue;
    let qh = 0, qt = 0;
    queue[qt++] = s; label[s] = nSeeds;
    let cnt = 0;
    while (qh < qt) {
      const i = queue[qh++]; cnt++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
      for (const j of nb) if (j >= 0 && label[j] === -1 && dsq[j] >= seedSq) { label[j] = nSeeds; queue[qt++] = j; }
    }
    seedSizes.push(cnt);
    nSeeds++;
  }
  if (!nSeeds) return [];

  // הגדלה: BFS רב-מקורות בתוך השטח הפנוי
  const free = (i: number) => !sealed[i];
  let qh = 0, qt = 0;
  for (let i = 0; i < w * h; i++) if (label[i] >= 0) queue[qt++] = i;
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const L = label[i];
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
    for (const j of nb) if (j >= 0 && label[j] === -1 && free(j)) { label[j] = L; queue[qt++] = j; }
  }

  // איחוד אזורים שנוגעים ברוחב גדול (למשל חדר שפוצל על ידי ריהוט) – לעומת צוואר דלת צר
  const parent = Array.from({ length: nSeeds }, (_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const contact = new Map<number, number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = label[i];
    if (a < 0) continue;
    if (x < w - 1) { const b = label[i + 1]; if (b >= 0 && b !== a) { const k = a < b ? a * nSeeds + b : b * nSeeds + a; contact.set(k, (contact.get(k) || 0) + 1); } }
    if (y < h - 1) { const b = label[i + w]; if (b >= 0 && b !== a) { const k = a < b ? a * nSeeds + b : b * nSeeds + a; contact.set(k, (contact.get(k) || 0) + 1); } }
  }
  const mergePx = 1.25 / mppW;
  for (const [k, c] of contact) if (c >= mergePx) parent[find(Math.floor(k / nSeeds))] = find(k % nSeeds);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0) label[i] = find(label[i]);

  // חילוץ מצולעים
  const groups = new Map<number, number[]>();
  for (let i = 0; i < w * h; i++) if (label[i] >= 0) (groups.get(label[i]) || groups.set(label[i], []).get(label[i])!).push(i);
  const minArea = (opts.minAreaM2 ?? 1.2) / (mppW * mppW);
  const out: DetectedRegion[] = [];
  for (const [lab, idx] of groups) {
    if (idx.length < minArea) continue;
    if (idx.length > 0.6 * w * h) continue; // "חוץ"
    let border = false;
    for (const i of idx) { const x = i % w, y = (i / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { border = true; break; } }
    const loop = outline(idx, label, lab, w, h);
    if (loop.length < 4) continue;
    const simp = simplify(loop, Math.max(1.2, 0.07 / mppW));
    if (simp.length < 3) continue;
    out.push({ poly: simp.map(([x, y]) => [Math.min(W0, x * f), Math.min(H0, y * f)] as Pt), areaPx: idx.length * f * f, touchesBorder: border });
  }
  return out.sort((a, b) => b.areaPx - a.areaPx);
}
