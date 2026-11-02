import { NextRequest, NextResponse } from 'next/server';
import { q, q1 } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  return NextResponse.json(await q('select * from alignments where project_id=$1', [pid]));
}

// שמירת יישור: {basePlanId, overlayPlanId, data}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const b = await req.json();
  const row = await q1(
    `insert into alignments(project_id,base_plan_id,overlay_plan_id,data) values($1,$2,$3,$4)
     on conflict (base_plan_id, overlay_plan_id) do update set data=excluded.data, updated_at=now() returning *`,
    [pid, b.basePlanId, b.overlayPlanId, JSON.stringify(b.data)],
  );
  return NextResponse.json(row);
}
