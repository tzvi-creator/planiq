import { NextRequest, NextResponse } from 'next/server';
import { PLAN_COLS, q, q1 } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const p = await q1(`select ${PLAN_COLS} from plans where id=$1`, [Number(id)]);
  if (!p) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(p);
}

// עדכון חלקי: name, discipline, kind, floor_id, scale_ratio, mpp, scale_source, analysis
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const b = await req.json();
  const sets: string[] = [];
  const vals: any[] = [];
  const add = (col: string, v: any, json = false) => { vals.push(json ? JSON.stringify(v) : v); sets.push(`${col}=$${vals.length}`); };
  for (const k of ['name', 'discipline', 'kind', 'floor_id', 'scale_ratio', 'mpp', 'scale_source']) if (k in b) add(k, b[k]);
  if ('analysis' in b) add('analysis', b.analysis, true);
  if (!sets.length) return NextResponse.json({ ok: true });
  vals.push(id);
  const row = await q1(`update plans set ${sets.join(',')} where id=$${vals.length} returning ${PLAN_COLS}`, vals);
  return NextResponse.json(row);
}

export async function DELETE(_: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  await q('delete from plans where id=$1', [id]);
  return NextResponse.json({ ok: true });
}
