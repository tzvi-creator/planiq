import { NextRequest, NextResponse } from 'next/server';
import { q1 } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const r = await q1<{ data: Buffer; mime: string; filename: string | null }>('select data, mime, filename from plans where id=$1', [id]);
  if (!r) return new NextResponse('not found', { status: 404 });
  return new NextResponse(new Uint8Array(r.data), {
    headers: { 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=3600' },
  });
}
