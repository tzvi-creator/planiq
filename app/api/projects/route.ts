import { NextRequest, NextResponse } from 'next/server';
import { q, q1 } from '@/lib/db';

export async function GET() {
  const rows = await q(`
    select p.*,
      (select count(*)::int from plans where project_id=p.id) as plan_count,
      (select count(*)::int from floors where project_id=p.id) as floor_count,
      (select count(*)::int from units where project_id=p.id) as unit_count
    from projects p order by p.id`);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: 'שם פרויקט חובה' }, { status: 400 });
  const p = await q1('insert into projects(name,address,description) values($1,$2,$3) returning *', [b.name.trim(), b.address || null, b.description || null]);
  return NextResponse.json(p);
}
