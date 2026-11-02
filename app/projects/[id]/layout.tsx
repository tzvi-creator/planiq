'use client';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { ProjectProvider, useProject } from '@/components/ProjectProvider';

const TABS: [string, string, string][] = [
  ['', 'סקירה והעלאת תכניות', 'overview'],
  ['/viewer', 'תכנית וחללים', 'viewer'],
  ['/quantities', 'כתבי כמויות', 'quantities'],
  ['/spec', 'מפרט מכר', 'spec'],
  ['/standards', 'בדיקת תקנים', 'standards'],
  ['/superposition', 'סופר פוזיציה', 'superposition'],
];

function Bar({ id }: { id: number }) {
  const path = usePathname();
  const { data, floorId, unitId, setFloorId, setUnitId } = useProject();
  const units = data.units.filter((u) => !floorId || u.floor_id === floorId);
  return (
    <div className="ctxbar">
      <div className="top">
        <span className="pname">{data.project.name}</span>
        <span className="muted small">{data.project.address}</span>
        <div className="grow" />
        <label className="row small" title="בחרו קומה: כל המסכים יסננו לפי הקומה שנבחרה">
          <b>קומה:</b>
          <select value={floorId ?? ''} onChange={(e) => setFloorId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">כל הקומות</option>
            {data.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="row small" title="בחרו דירה/יחידה שעובדים עליה כעת">
          <b>דירה פעילה:</b>
          <select value={unitId ?? ''} onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">כל הדירות</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </div>
      <nav className="tabs">
        {TABS.map(([href, label]) => {
          const full = `/projects/${id}${href}`;
          const active = href === '' ? path === full : path.startsWith(full);
          return <Link key={href} href={full} className={`tab${active ? ' active' : ''}`}>{label}</Link>;
        })}
      </nav>
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  return (
    <ProjectProvider projectId={pid}>
      {(data, err) =>
        data ? (
          <>
            <Bar id={pid} />
            {children}
          </>
        ) : (
          <div className="page">{err ? <div className="banner bad">{err}</div> : <p className="muted">טוען פרויקט…</p>}</div>
        )
      }
    </ProjectProvider>
  );
}
