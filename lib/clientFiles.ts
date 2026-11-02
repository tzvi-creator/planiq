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

export interface Rendered { blob: Blob; width: number; height: number; paperWidthMm: number | null; dataUrl: string }

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
  return {
    blob, width: canvas.width, height: canvas.height,
    paperWidthMm: (v1.width / 72) * 25.4, // רוחב העמוד במ"מ (1pt = 1/72")
    dataUrl: canvas.toDataURL('image/jpeg', 0.8),
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
export async function planImageForAI(planId: number, maxDim = 2000): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('טעינת התכנית נכשלה'));
    i.src = `/api/plans/${planId}/file`;
  });
  const w = img.naturalWidth || 1600, h = img.naturalHeight || 1200;
  const k = Math.min(1, maxDim / Math.max(w, h)) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
