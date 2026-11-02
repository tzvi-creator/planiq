'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PlanMeta, ProjectData, Unit } from '@/lib/types';
import { readCtx, writeCtx } from './AgentChat';

interface PCtx {
  data: ProjectData;
  reload: () => Promise<void>;
  floorId: number | null;
  unitId: number | null;
  setFloorId: (id: number | null) => void;
  setUnitId: (id: number | null) => void;
  patchPlan: (p: PlanMeta) => void;
  setUnits: (u: Unit[]) => void;
}

const Ctx = createContext<PCtx | null>(null);
export const useProject = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useProject מחוץ לפרויקט');
  return c;
};

export function ProjectProvider({ projectId, children }: { projectId: number; children: (d: ProjectData | null, err: string) => React.ReactNode }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [err, setErr] = useState('');
  const [floorId, _setFloor] = useState<number | null>(null);
  const [unitId, _setUnit] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}`);
    if (!r.ok) { setErr('הפרויקט לא נמצא'); return; }
    setData(await r.json());
  }, [projectId]);

  useEffect(() => {
    reload();
    const c = readCtx(projectId);
    _setFloor(c.floorId ?? null);
    _setUnit(c.unitId ?? null);
  }, [projectId, reload]);

  const setFloorId = (id: number | null) => {
    _setFloor(id);
    // איפוס דירה שאינה שייכת לקומה החדשה
    const keep = id && data ? data.units.find((u) => u.id === unitId)?.floor_id === id : true;
    if (!keep) { _setUnit(null); writeCtx(projectId, { floorId: id, unitId: null }); }
    else writeCtx(projectId, { floorId: id });
  };
  const setUnitId = (id: number | null) => { _setUnit(id); writeCtx(projectId, { unitId: id }); };
  const patchPlan = (p: PlanMeta) => setData((d) => (d ? { ...d, plans: d.plans.map((x) => (x.id === p.id ? { ...x, ...p } : x)) } : d));
  const setUnits = (units: Unit[]) => setData((d) => (d ? { ...d, units } : d));

  if (!data) return <>{children(null, err)}</>;
  return (
    <Ctx.Provider value={{ data, reload, floorId, unitId, setFloorId, setUnitId, patchPlan, setUnits }}>
      {children(data, err)}
    </Ctx.Provider>
  );
}
