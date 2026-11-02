import { NextRequest, NextResponse } from 'next/server';
import { PLAN_COLS, q1 } from '@/lib/db';

export const maxDuration = 60;

// העלאת קובץ תכנית (multipart): file + שדות מטא
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 });
  const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
  const projectId = num('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId חסר' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 4.3 * 1024 * 1024) return NextResponse.json({ error: 'הקובץ גדול מ-4.3MB. הקטינו את הרזולוציה או פצלו לעמודים.' }, { status: 413 });
  const width = num('width') || 1, height = num('height') || 1;
  const ratio = num('scaleRatio'), paper = num('paperWidthMm');
  let mpp: number | null = null, src: string | null = null;
  if (ratio && paper) { mpp = ((paper / 1000) * ratio) / width; src = 'ratio'; }
  const row = await q1(
    `insert into plans(project_id,floor_id,name,filename,discipline,kind,mime,data,width,height,paper_width_mm,scale_ratio,mpp,scale_source)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning ${PLAN_COLS}`,
    [projectId, num('floorId'), String(fd.get('name') || file.name), String(fd.get('filename') || file.name), String(fd.get('discipline') || 'architecture'),
      String(fd.get('kind') || 'plan'), String(fd.get('mime') || file.type || 'application/octet-stream'), buf, width, height, paper, ratio, mpp, src],
  );
  return NextResponse.json(row);
}
