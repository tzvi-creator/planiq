import { NextRequest, NextResponse } from 'next/server';
import { q, q1 } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const rid = req.nextUrl.searchParams.get('reportId');
  if (rid) return NextResponse.json(await q1('select * from reports where id=$1 and project_id=$2', [Number(rid), pid]));
  return NextResponse.json(await q('select id,title,created_at from reports where project_id=$1 order by id desc', [pid]));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const b = await req.json();
  const row = await q1('insert into reports(project_id,title,content) values($1,$2,$3) returning id,title,created_at', [pid, b.title || 'דוח סופר פוזיציה', JSON.stringify(b.content)]);
  return NextResponse.json(row);
}
