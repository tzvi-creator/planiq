import { NextRequest, NextResponse } from 'next/server';
import { q, q1 } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// הוספה: {type:'floor'|'unit', name, floorId?}
export async function POST(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: 'שם חובה' }, { status: 400 });
  if (b.type === 'floor') {
    const max = await q1<{ m: number }>('select coalesce(max(sort),-1)+1 m from floors where project_id=$1', [pid]);
    return NextResponse.json(await q1('insert into floors(project_id,name,sort) values($1,$2,$3) returning *', [pid, b.name.trim(), max!.m]));
  }
  if (b.type === 'unit') {
    return NextResponse.json(await q1('insert into units(project_id,floor_id,name) values($1,$2,$3) returning *', [pid, b.floorId || null, b.name.trim()]));
  }
  return NextResponse.json({ error: 'סוג לא תקין' }, { status: 400 });
}

// שינוי שם: {type,id,name}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const b = await req.json();
  const table = b.type === 'floor' ? 'floors' : 'units';
  await q(`update ${table} set name=$1 where id=$2 and project_id=$3`, [b.name, b.id, pid]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const type = req.nextUrl.searchParams.get('type');
  const id = Number(req.nextUrl.searchParams.get('id'));
  const table = type === 'floor' ? 'floors' : 'units';
  await q(`delete from ${table} where id=$1 and project_id=$2`, [id, pid]);
  return NextResponse.json({ ok: true });
}
