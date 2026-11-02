// עזרי צד-לקוח: רנדור PDF לתמונה (pdf.js מ-CDN), כיווץ תמונות
const PDFJS_VER = '3.11.174';
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;

let pdfjsPromise: Promise<any> | null = null;
export function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${BASE}/pdf.min.js`;
    s.onload = async () => {
      const lib = (window as any).pdfjsLib;
      try {
        // worker מ-origin אחר: טוענים כ-blob כדי לעקוף CORS
        const code = await (await fetch(`${BASE}/pdf.worker.min.js`)).text();
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      } catch { lib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.js`; }
      resolve(lib);
    };
    s.onerror = () => reject(new Error('טעינת רכיב ה-PDF נכשלה (בדקו חיבור לאינטרנט)'));
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

export interface TextItem { t: string; x: number; y: number }
export interface Rendered { blob: Blob; width: number; height: number; paperWidthMm: number | null; dataUrl: string; texts?: TextItem[] }

const MAX_BYTES = 4.0 * 1024 * 1024;

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  let q = 0.88;
  for (;;) {
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', q));
    if (blob.size <= MAX_BYTES || q < 0.4) return blob;
    q -= 0.1;
  }
}

export async function pdfInfo(file: File): Promise<{ pages: number }> {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  return { pages: pdf.numPages };
}

export async function renderPdfPage(file: File, pageNum: number, maxDim = 3200): Promise<Rendered> {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(Math.min(Math.max(1, pageNum), pdf.numPages));
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(maxDim / Math.max(v1.width, v1.height), 4);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await canvasToJpeg(canvas);
  // טקסט מדויק משכבת הטקסט של ה-PDF (שמות חללים, מידות, סימוני פתחים) עם מיקום מנורמלי
  let texts: TextItem[] = [];
  try {
    const tc = await page.getTextContent();
    for (const it of tc.items as any[]) {
      const s = String(it.str || '').trim();
      if (!s) continue;
      const [px, py] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const w = (it.width || 0) * scale, h = (it.height || 0) * scale;
      const x = (px + w / 2) / canvas.width, y = (py - h / 2) / canvas.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      texts.push({ t: s.slice(0, 60), x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
    }
    if (texts.length > 6000) texts = texts.slice(0, 6000);
  } catch { texts = []; }
  return {
    blob, width: canvas.width, height: canvas.height,
    paperWidthMm: (v1.width / 72) * 25.4, // רוחב העמוד במ"מ (1pt = 1/72")
    dataUrl: canvas.toDataURL('image/jpeg', 0.8),
    texts,
  };
}

export async function prepareImage(file: File, maxDim = 3200): Promise<Rendered> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('לא ניתן לקרוא את התמונה')); i.src = url; });
  const k = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob = await canvasToJpeg(canvas);
  return { blob, width: canvas.width, height: canvas.height, paperWidthMm: null, dataUrl: canvas.toDataURL('image/jpeg', 0.8) };
}

// תמונה לניתוח AI מתוך כתובת תכנית שמורה (תומך גם ב-SVG)
export interface Region { x0: number; y0: number; x1: number; y1: number } // מנורמל

export async function planImageForAI(planId: number, maxDim = 2000, region?: Region): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('טעינת התכנית נכשלה'));
    i.src = `/api/plans/${planId}/file`;
  });
  const W = img.naturalWidth || 1600, H = img.naturalHeight || 1200;
  // חיתוך אזור ברזולוציה מקורית (אפשר להגדיל עד פי 2 כדי שהמודל יראה פרטים קטנים)
  const sx = region ? region.x0 * W : 0, sy = region ? region.y0 * H : 0;
  const sw = region ? (region.x1 - region.x0) * W : W, sh = region ? (region.y1 - region.y0) * H : H;
  const k = region ? Math.min(2, maxDim / Math.max(sw, sh)) : Math.min(1, maxDim / Math.max(sw, sh)) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}
