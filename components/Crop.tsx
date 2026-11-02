'use client';
import type { PlanMeta } from '@/lib/types';

// חיתוך תצוגה של תכנית סביב נקודה מנורמלת, עם סימון
export default function Crop({ plan, x, y, zoom = 3, marks = [] }: { plan: PlanMeta; x: number; y: number; zoom?: number; marks?: { x: number; y: number; color?: string }[] }) {
  const w = plan.width / zoom, h = (w * 3) / 4;
  const cx = x * plan.width, cy = y * plan.height;
  const x0 = Math.min(Math.max(0, cx - w / 2), Math.max(0, plan.width - w));
  const y0 = Math.min(Math.max(0, cy - h / 2), Math.max(0, plan.height - h));
  const r = w / 28;
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} style={{ width: '100%', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, display: 'block' }}>
      <image href={`/api/plans/${plan.id}/file`} x={0} y={0} width={plan.width} height={plan.height} />
      {marks.map((m, i) => <circle key={i} cx={m.x * plan.width} cy={m.y * plan.height} r={r * 0.6} fill={m.color || '#1565c0'} fillOpacity={0.6} stroke="#fff" strokeWidth={r / 6} />)}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#d32f2f" strokeWidth={r / 3} />
      <circle cx={cx} cy={cy} r={r * 2} fill="none" stroke="#d32f2f" strokeWidth={r / 6} strokeDasharray={`${r / 2} ${r / 3}`} />
    </svg>
  );
}
