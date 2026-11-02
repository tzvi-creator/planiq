import { NextRequest, NextResponse } from 'next/server';
import { loadProjectData, q } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const d = await loadProjectData(Number(id));
  if (!d) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(d);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const b = await req.json();
  await q('update projects set name=coalesce($2,name), address=coalesce($3,address), description=coalesce($4,description) where id=$1', [Number(id), b.name ?? null, b.address ?? null, b.description ?? null]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await q('delete from projects where id=$1', [Number(id)]);
  return NextResponse.json({ ok: true });
}
