'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Help from '@/components/Help';
import { useProject } from '@/components/ProjectProvider';
import { writeCtx } from '@/components/AgentChat';
import { planImageForAI } from '@/lib/clientFiles';
import { bboxPx, centroid, fmt, pointInPoly, polyAreaPx, roomMetrics } from '@/lib/geometry';
import { DISCIPLINES, FIXTURE_KINDS, OPENING_TYPES, ROOM_TYPES, type Analysis, type Pt, type Room, type RoomType } from '@/lib/types';

type Mode = 'select' | 'measure' | 'calibrate' | 'draw' | 'region';
type Label = 'none' | 'area' | 'dims' | 'both';
type Sel = { kind: 'room' | 'opening' | 'fixture'; id: string } | null;

export default function ViewerPage() {
  return <Suspense fallback={<div className="page muted">טוען…</div>}><Viewer /></Suspense>;
}

function Viewer() {
  const { data, floorId, unitId, patchPlan, setUnits, reload } = useProject();
  const sp = useSearchParams();
  const pid = data.project.id;

  const planChoices = useMemo(
    () => data.plans.filter((p) => !floorId || p.floor_id === floorId || p.floor_id === null),
    [data.plans, floorId],
  );
  const [planId, setPlanId] = useState<number | null>(null);
  useEffect(() => {
    const fromUrl = Number(sp.get('plan'));
    if (fromUrl && data.plans.some((p) => p.id === fromUrl)) { setPlanId(fromUrl); return; }
    setPlanId((cur) => (cur && planChoices.some((p) => p.id === cur) ? cur : planChoices.find((p) => p.discipline === 'architecture' && p.kind === 'plan')?.id ?? planChoices[0]?.id ?? null));
  }, [sp, data.plans, planChoices]);

  const plan = data.plans.find((p) => p.id === planId) || null;
  useEffect(() => { if (planId) writeCtx(pid, { planId }); }, [planId, pid]);

  // ----- טיוטת ניתוח הניתנת לעריכה -----
  const [draft, setDraft] = useState<Analysis | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setDraft(plan?.analysis ? structuredClone(plan.analysis) : null); setDirty(false); setSel(null); setPts([]); }, [plan?.id, plan?.analyzed_at]); // eslint-disable-line

  const [mode, setMode] = useState<Mode>('select');
  const [label, setLabel] = useState<Label>('both');
  const [layers, setLayers] = useState({ rooms: true, function: true, openings: true, fixtures: true, units: true });
  const [sel, setSel] = useState<Sel>(null);
  const [pts, setPts] = useState<Pt[]>([]); // נקודות במצב מדידה/כיול/ציור (מנורמלות)
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'bad' | 'info'; s: string } | null>(null);
  const [hint, setHint] = useState('');

  // ----- תצוגה (זום/הזזה) -----
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const fit = useCallback(() => {
    if (!plan || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const k = Math.min(r.width / plan.width, r.height / plan.height) * 0.96;
    setView({ k, x: (r.width - plan.width * k) / 2, y: (r.height - plan.height * k) / 2 });
  }, [plan]);
  useEffect(() => {
    fit();
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => {
        const nk = Math.min(12, Math.max(0.05, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        return { k: nk, x: mx - ((mx - v.x) / v.k) * nk, y: my - ((my - v.y) / v.k) * nk };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [plan?.id]);

  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const toNorm = (cx: number, cy: number): Pt => {
    const r = stage.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.k / plan!.width, (cy - r.top - view.y) / view.k / plan!.height];
  };

  const unitFilter = (r: Room) => !unitId || r.unitId === unitId;

  function hitTest(p: Pt): Sel {
    if (!draft || !plan) return null;
    const rad = 11 / view.k;
    const d = (a: Pt, bx: number, by: number) => Math.hypot((a[0] - bx) * plan.width, (a[1] - by) * plan.height);
    if (layers.fixtures) for (const f of draft.fixtures) if (d(p, f.x, f.y) < rad) return { kind: 'fixture', id: f.id };
    if (layers.openings) for (const o of draft.openings) if (d(p, o.x, o.y) < rad * 1.3) return { kind: 'opening', id: o.id };
    const hits = draft.rooms.filter((r) => pointInPoly(p, r.polygon)).sort((a, b) => polyAreaPx(a.polygon, 1, 1) - polyAreaPx(b.polygon, 1, 1));
    return hits[0] ? { kind: 'room', id: hits[0].id } : null;
  }

  const [region, setRegion] = useState<{ a: Pt; b: Pt } | null>(null);
  const regionDrag = useRef(false);
  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === 'region' && plan) { regionDrag.current = true; const p = toNorm(e.clientX, e.clientY); setRegion({ a: p, b: p }); return; }
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (regionDrag.current) { const p = toNorm(e.clientX, e.clientY); setRegion((r) => (r ? { ...r, b: p } : r)); return; }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (regionDrag.current) {
      regionDrag.current = false;
      setRegion((r) => (r && Math.abs(r.a[0] - r.b[0]) * (plan?.width || 1) > 40 && Math.abs(r.a[1] - r.b[1]) * (plan?.height || 1) > 40 ? r : null));
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !plan) return;
    const p = toNorm(e.clientX, e.clientY);
    if (mode === 'select') setSel(hitTest(p));
    else if (mode === 'measure') setPts((a) => (a.length >= 2 ? [p] : [...a, p]));
    else if (mode === 'draw') setPts((a) => [...a, p]);
    else if (mode === 'calibrate') {
      const next = [...pts, p];
      if (next.length < 2) { setPts(next); return; }
      const px = Math.hypot((next[1][0] - next[0][0]) * plan.width, (next[1][1] - next[0][1]) * plan.height);
      const s = prompt('מהו האורך האמיתי של הקו שסימנתם, במטרים? (למשל 3.6)');
      setPts([]);
      const m = Number((s || '').replace(',', '.'));
      if (!m || m <= 0 || px < 3) { setMsg({ t: 'bad', s: 'הכיול בוטל.' }); return; }
      const mpp = m / px;
      fetch(`/api/plans/${plan.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mpp, scale_source: 'manual' }) })
        .then((r) => r.json()).then((p2) => { patchPlan(p2); setMsg({ t: 'ok', s: `קנה המידה כויל: ${fmt(mpp * 1000, 2)} מ"מ לפיקסל. כל השטחים חושבו מחדש.` }); setMode('select'); });
    }
  }

  async function runAI(useRegion = false) {
    if (!plan) return;
    const rg = useRegion && region ? { x0: Math.min(region.a[0], region.b[0]), y0: Math.min(region.a[1], region.b[1]), x1: Math.max(region.a[0], region.b[0]), y1: Math.max(region.a[1], region.b[1]) } : undefined;
    if (!rg && plan.analysis && !confirm('קיים כבר ניתוח לתכנית זו. ניתוח חדש יחליף אותו (כולל עריכות ידניות). להמשיך?')) return;
    if (dirty && !confirm('יש שינויים שלא נשמרו שיאבדו בניתוח. להמשיך?')) return;
    setBusy('ai'); setMsg({ t: 'info', s: rg ? 'ה-AI קורא את האזור שנבחר… עד דקה.' : 'ה-AI קורא את התכנית… זה עשוי לקחת עד דקה.' });
    try {
      const image = await planImageForAI(plan.id, rg ? 2200 : 2000, rg);
      const r = await fetch(`/api/plans/${plan.id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl: image, scaleRatio: plan.scale_ratio, hint, region: rg }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'הניתוח נכשל');
      patchPlan(j.plan); setUnits(j.units);
      setMsg({ t: 'ok', s: `הניתוח הושלם: ${j.plan.analysis.rooms.length} חללים, ${j.plan.analysis.openings.length} פתחים, ${j.plan.analysis.fixtures.length} אביזרים.` });
      reload();
    } catch (e: any) { setMsg({ t: 'bad', s: e.message }); }
    setBusy('');
  }

  async function save() {
    if (!plan || !draft) return;
    setBusy('save');
    const r = await fetch(`/api/plans/${plan.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis: { ...draft, source: draft.source === 'seed' ? 'seed' : 'manual' } }) });
    const p2 = await r.json();
    patchPlan(p2); setDirty(false); setBusy('');
    setMsg({ t: 'ok', s: 'השינויים נשמרו.' });
  }

  const mut = (fn: (a: Analysis) => void) => { setDraft((d) => { if (!d) return d; const c = structuredClone(d); fn(c); return c; }); setDirty(true); };

  function finishDraw() {
    if (pts.length < 3) { setMsg({ t: 'bad', s: 'צריך לפחות 3 נקודות לחלל.' }); return; }
    const name = prompt('שם החלל החדש', 'חלל חדש');
    if (!name) return;
    const room: Room = { id: 'm' + Date.now().toString(36), name, type: 'other', unitId: unitId ?? null, polygon: pts };
    mut((a) => { a.rooms.push(room); });
    setSel({ kind: 'room', id: room.id });
    setPts([]); setMode('select');
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPts([]); setMode('select'); }
      if (e.key === 'Enter' && mode === 'draw') finishDraw();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line

  // ----- חישובים להצגה -----
  const metrics = useMemo(() => {
    const m = new Map<string, ReturnType<typeof roomMetrics>>();
    if (plan && draft) for (const r of draft.rooms) m.set(r.id, roomMetrics(r, plan));
    return m;
  }, [plan, draft]);

  const unitOutlines = useMemo(() => {
    if (!plan || !draft) return [];
    const by = new Map<number, Room[]>();
    for (const r of draft.rooms) if (r.unitId) (by.get(r.unitId) || by.set(r.unitId, []).get(r.unitId)!).push(r);
    return [...by.entries()].map(([uid, rooms]) => {
      const all = rooms.flatMap((r) => r.polygon);
      const b = bboxPx(all, plan.width, plan.height);
      const area = rooms.reduce((a, r) => a + (metrics.get(r.id)?.areaM2 ?? 0), 0);
      return { uid, b, name: data.units.find((u) => u.id === uid)?.name ?? '', area, active: !unitId || unitId === uid };
    });
  }, [draft, plan, metrics, data.units, unitId]);

  const selRoom = sel?.kind === 'room' ? draft?.rooms.find((r) => r.id === sel.id) : null;
  const selOpening = sel?.kind === 'opening' ? draft?.openings.find((o) => o.id === sel.id) : null;
  const selFixture = sel?.kind === 'fixture' ? draft?.fixtures.find((o) => o.id === sel.id) : null;
  const fs = Math.min(42, Math.max(9, 13 / view.k));
  const unitsHere = data.units.filter((u) => !plan?.floor_id || u.floor_id === plan.floor_id);
  const isImage = plan && plan.mime.startsWith('image/');

  const measureText = (a: Pt, b: Pt) => {
    if (!plan?.mpp) return 'אין קנה מידה';
    const px = Math.hypot((b[0] - a[0]) * plan.width, (b[1] - a[1]) * plan.height);
    return `${fmt(px * plan.mpp, 2)} מ'`;
  };

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <Help
        title="תכנית וחללים"
        intro="מסך הצפייה המרכזי: מציג את התכנית עם שכבות חללים, שטחים, מידות וייעוד כל חלל. אפשר לבקש מה-AI לנתח תכנית חדשה, לכייל קנה מידה, למדוד, ולתקן ידנית."
        items={[
          ['בחירת תכנית', 'בתיבה בצד ימין בוחרים איזו תכנית להציג. הרשימה מסוננת לפי הקומה שנבחרה בסרגל העליון.'],
          ['🤖 נתח תכנית עם AI', 'שולח את התכנית לניתוח: זיהוי חללים וייעודם, פתחים, אביזרי חשמל/אינסטלציה וקנה מידה. התוצאה נשמרת ואפשר לתקן אותה ידנית. התוצאה היא הערכה – יש לבדוק!'],
          ['הצגה: שטח / מידות / שניהם', 'קובע מה מוצג על כל חלל. לחיצה על חלל בתכנית פותחת את הפרטים המלאים שלו בצד שמאל.'],
          ['שכבות', 'חללים (מצולעים), ייעוד (צבע ושם לפי תפקיד החלל), פתחים (דלתות/חלונות), אביזרים (חשמל ואינסטלציה), גבולות דירות.'],
          ['דירה פעילה (סרגל עליון)', 'כשנבחרה דירה – חללי הדירה מודגשים ושאר התכנית מעומעמת.'],
          ['📏 מדידה', 'לחצו על שתי נקודות בתכנית וקבלו מרחק במטרים (דורש קנה מידה).'],
          ['⚖ כיול קנה מידה', 'לחצו על שתי נקודות במרחק ידוע (למשל קו מידה) והזינו את האורך האמיתי במטרים. כל השטחים יחושבו מחדש.'],
          ['✏ ציור חלל', 'לחצו על פינות החלל ברצף ואז "סיום" (או Enter) כדי להוסיף חלל ידנית. Esc מבטל.'],
          ['זום והזזה', 'גלגלת העכבר – זום; גרירה – הזזה; "התאמה למסך" מחזיר לתצוגה מלאה.'],
          ['שמירת שינויים', 'שינויים ידניים (שם, ייעוד, דירה, חללים שנוספו/נמחקו) נשמרים רק בלחיצה על "שמירה".'],
        ]}
      />
      {msg && <div className={`banner ${msg.t}`} onClick={() => setMsg(null)}>{msg.s}</div>}

      <div className="viewer">
        {/* ---------- צד ימין: פקדים ---------- */}
        <div className="card" style={{ margin: 0 }}>
          <label className="fld">תכנית
            <select value={planId ?? ''} onChange={(e) => setPlanId(Number(e.target.value))}>
              {planChoices.map((p) => <option key={p.id} value={p.id}>{p.name} · {DISCIPLINES[p.discipline]}</option>)}
            </select>
          </label>
          {plan && (
            <>
              <div className="row" style={{ margin: '8px 0' }}>
                {plan.mpp ? <span className="chip ok">קנה מידה: {plan.scale_source === 'manual' ? 'כויל ידנית' : plan.scale_ratio ? `1:${plan.scale_ratio}` : plan.scale_source}</span> : <span className="chip warn">קנה מידה לא ידוע</span>}
                {draft ? <span className="chip">{draft.source === 'ai' ? 'ניתוח AI' : draft.source === 'seed' ? 'נתוני דוגמה' : 'ערוך ידנית'}</span> : <span className="chip">טרם נותח</span>}
              </div>
              <label className="fld">הערה ל-AI (לא חובה)
                <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="למשל: זו דירת 4 חדרים, קנה מידה 1:100" />
              </label>
              <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={() => runAI(false)} disabled={!!busy || !isImage}>
                {busy === 'ai' ? <><span className="spin" /> מנתח…</> : '🤖 נתח את כל התכנית עם AI'}
              </button>
              <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={() => runAI(true)} disabled={!!busy || !region}>
                🤖 נתח רק את האזור המסומן {region ? '' : '(סמנו אזור קודם)'}
              </button>
              <p className="muted small" style={{ marginTop: 6 }}>גיליון עמוס עם כמה דירות/בניינים? לחצו "▭ בחירת אזור", גררו מסגרת סביב דירה אחת ונתחו אותה – כך התוצאה מדויקת בהרבה. כל אזור נוסף מתווסף לניתוח הקיים.</p>
              {!isImage && <p className="small muted">הקובץ אינו תמונה/PDF – המירו ל-PDF כדי לנתח.</p>}
            </>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '12px 0' }} />
          <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>הצגה על החללים</div>
          <div className="seg">
            {([['none', 'ללא'], ['area', 'שטח'], ['dims', 'מידות'], ['both', 'שניהם']] as [Label, string][]).map(([k, t]) => (
              <button key={k} className={label === k ? 'on' : ''} onClick={() => setLabel(k)}>{t}</button>
            ))}
          </div>
          <div className="small" style={{ fontWeight: 700, margin: '10px 0 4px' }}>שכבות</div>
          <div className="grid" style={{ gap: 4 }}>
            {([['rooms', 'חללים (מצולעים)'], ['function', 'ייעוד חללים (צבע + שם)'], ['openings', 'פתחים – דלתות וחלונות'], ['fixtures', 'אביזרי חשמל ואינסטלציה'], ['units', 'גבולות דירות']] as [keyof typeof layers, string][]).map(([k, t]) => (
              <label key={k} className="chk"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{t}</label>
            ))}
          </div>
          {layers.function && draft && (
            <>
              <div className="small" style={{ fontWeight: 700, margin: '10px 0 4px' }}>מקרא ייעוד</div>
              <div className="legend">
                {[...new Set(draft.rooms.map((r) => r.type))].map((t) => (
                  <span key={t} className="row" style={{ gap: 5 }}><i className="dot" style={{ background: ROOM_TYPES[t]?.color }} />{ROOM_TYPES[t]?.label}</span>
                ))}
              </div>
            </>
          )}
          {draft && (
            <>
              <div className="small" style={{ fontWeight: 700, margin: '10px 0 4px' }}>חללים ({draft.rooms.length})</div>
              <div className="roomlist">
                {draft.rooms.filter(unitFilter).map((r) => (
                  <div key={r.id} className={`roomitem${sel?.id === r.id ? ' sel' : ''}`} onClick={() => setSel({ kind: 'room', id: r.id })}>
                    <i className="dot" style={{ background: ROOM_TYPES[r.type]?.color }} />
                    <span className="grow">{r.name}</span>
                    <span className="muted small">{metrics.get(r.id) ? fmt(metrics.get(r.id)!.areaM2, 1) : '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ---------- אמצע: הבד ---------- */}
        <div>
          <div className="row noprint" style={{ marginBottom: 8 }}>
            {([['select', '👆 בחירה'], ['region', '▭ בחירת אזור לניתוח'], ['measure', '📏 מדידה'], ['calibrate', '⚖ כיול קנה מידה'], ['draw', '✏ ציור חלל']] as [Mode, string][]).map(([m, t]) => (
              <button key={m} className={`btn sm${mode === m ? ' active' : ''}`} onClick={() => { setMode(m); setPts([]); }}>{t}</button>
            ))}
            {mode === 'draw' && <button className="btn sm primary" onClick={finishDraw}>סיום ציור</button>}
            <button className="btn sm" onClick={fit}>התאמה למסך</button>
            <div className="grow" />
            {dirty && <span className="chip warn">יש שינויים שלא נשמרו</span>}
            <button className="btn sm primary" disabled={!dirty || !!busy} onClick={save}>שמירה</button>
          </div>
          {mode !== 'select' && (
            <div className="banner info">
              {mode === 'region' && 'גררו מסגרת סביב האזור לניתוח (למשל דירה אחת), ואז לחצו "נתח רק את האזור המסומן" בצד ימין. אפשר להתקרב עם הגלגלת לפני הסימון.'}
              {mode === 'measure' && 'מדידה: לחצו על שתי נקודות בתכנית.'}
              {mode === 'calibrate' && `כיול: לחצו על שתי נקודות במרחק ידוע (${pts.length}/2).`}
              {mode === 'draw' && `ציור: לחצו על פינות החלל (${pts.length} נקודות), ואז "סיום ציור" או Enter.`}
              {' '}(Esc – ביטול)
            </div>
          )}
          <div ref={stage} className={`stage${mode !== 'select' ? ' crosshair' : ''}`}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {!plan ? <p className="muted" style={{ padding: 20 }}>אין תכניות להצגה. העלו תכנית במסך הסקירה.</p> : !isImage ? (
              <div className="banner warn" style={{ margin: 20 }}>הקובץ "{plan.filename}" הוא קובץ CAD ואינו ניתן להצגה. המירו אותו ל-PDF והעלו מחדש.</div>
            ) : (
              <div className="inner" style={{ width: plan.width, height: plan.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
                <img src={`/api/plans/${plan.id}/file`} width={plan.width} height={plan.height} alt={plan.name} draggable={false} />
                <svg className="ov" viewBox={`0 0 ${plan.width} ${plan.height}`} style={{ pointerEvents: 'none' }}>
                  {layers.units && unitOutlines.map((u) => (
                    <g key={u.uid} opacity={u.active ? 1 : 0.35}>
                      <rect x={u.b.x0 - 6} y={u.b.y0 - 6} width={u.b.w + 12} height={u.b.h + 12} fill="none" stroke="#1b5e20" strokeWidth={3 / view.k} strokeDasharray={`${10 / view.k} ${6 / view.k}`} />
                      <text x={u.b.x0 + u.b.w / 2} y={u.b.y0 - 14 / view.k} textAnchor="middle" fontSize={fs * 1.1} fontWeight={700} fill="#1b5e20" stroke="#fff" strokeWidth={fs / 5} paintOrder="stroke">
                        {u.name}{u.area ? ` · ${fmt(u.area, 1)} מ"ר` : ''}
                      </text>
                    </g>
                  ))}
                  {layers.rooms && draft?.rooms.map((r) => {
                    const on = unitFilter(r);
                    const m = metrics.get(r.id);
                    const c = centroid(r.polygon);
                    const cx = c[0] * plan.width, cy = c[1] * plan.height;
                    const color = layers.function ? ROOM_TYPES[r.type]?.color ?? '#90a4ae' : '#4a90e2';
                    const isSel = sel?.kind === 'room' && sel.id === r.id;
                    const b = bboxPx(r.polygon, plan.width, plan.height);
                    const lines: string[] = [];
                    if (layers.function) lines.push(r.name);
                    if ((label === 'area' || label === 'both') && m) lines.push(`${fmt(m.areaM2, 2)} מ"ר`);
                    if ((label === 'dims' || label === 'both') && m) lines.push(`${fmt(b.w * (plan.mpp || 0), 2)}×${fmt(b.h * (plan.mpp || 0), 2)}${m.rect ? '' : '≈'}`);
                    return (
                      <g key={r.id} opacity={on ? 1 : 0.18}>
                        <polygon points={r.polygon.map((p) => `${p[0] * plan.width},${p[1] * plan.height}`).join(' ')}
                          fill={color} fillOpacity={isSel ? 0.55 : layers.function ? 0.32 : 0.14} stroke={isSel ? '#d32f2f' : color} strokeWidth={(isSel ? 3.5 : 1.6) / view.k} />
                        {lines.map((t, i) => (
                          <text key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * fs * 1.15} textAnchor="middle" dominantBaseline="middle"
                            fontSize={fs} fontWeight={i === 0 && layers.function ? 700 : 600} fill="#111" stroke="#fff" strokeWidth={fs / 4.5} paintOrder="stroke">{t}</text>
                        ))}
                      </g>
                    );
                  })}
                  {layers.openings && draft?.openings.map((o) => {
                    const isSel = sel?.kind === 'opening' && sel.id === o.id;
                    const col = o.type === 'window' ? '#1976d2' : o.type === 'sliding' ? '#00897b' : o.type === 'entrance' ? '#c62828' : '#ef6c00';
                    return <circle key={o.id} cx={o.x * plan.width} cy={o.y * plan.height} r={(isSel ? 9 : 6) / view.k} fill={col} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5 / view.k} />;
                  })}
                  {layers.fixtures && draft?.fixtures.map((f) => {
                    const isSel = sel?.kind === 'fixture' && sel.id === f.id;
                    const k = FIXTURE_KINDS[f.kind];
                    return <rect key={f.id} x={f.x * plan.width - 5 / view.k} y={f.y * plan.height - 5 / view.k} width={10 / view.k} height={10 / view.k} rx={2 / view.k}
                      fill={k?.disc === 'electrical' ? '#d32f2f' : '#1565c0'} fillOpacity={0.8} stroke={isSel ? '#000' : '#fff'} strokeWidth={(isSel ? 2.5 : 1) / view.k} />;
                  })}
                  {/* מדידה / כיול / ציור */}
                  {(mode === 'measure' || mode === 'calibrate') && pts.length > 0 && (
                    <g>
                      {pts.map((p, i) => <circle key={i} cx={p[0] * plan.width} cy={p[1] * plan.height} r={5 / view.k} fill="#d32f2f" />)}
                      {pts.length === 2 && <>
                        <line x1={pts[0][0] * plan.width} y1={pts[0][1] * plan.height} x2={pts[1][0] * plan.width} y2={pts[1][1] * plan.height} stroke="#d32f2f" strokeWidth={2.5 / view.k} />
                        {mode === 'measure' && <text x={(pts[0][0] + pts[1][0]) / 2 * plan.width} y={(pts[0][1] + pts[1][1]) / 2 * plan.height - 8 / view.k} textAnchor="middle" fontSize={fs * 1.2} fontWeight={800} fill="#d32f2f" stroke="#fff" strokeWidth={fs / 4} paintOrder="stroke">{measureText(pts[0], pts[1])}</text>}
                      </>}
                    </g>
                  )}
                  {region && (
                    <rect x={Math.min(region.a[0], region.b[0]) * plan.width} y={Math.min(region.a[1], region.b[1]) * plan.height}
                      width={Math.abs(region.a[0] - region.b[0]) * plan.width} height={Math.abs(region.a[1] - region.b[1]) * plan.height}
                      fill="#2b6cb022" stroke="#2b6cb0" strokeWidth={3 / view.k} strokeDasharray={`${10 / view.k} ${6 / view.k}`} />
                  )}
                  {mode === 'draw' && pts.length > 0 && (
                    <g>
                      <polyline points={pts.map((p) => `${p[0] * plan.width},${p[1] * plan.height}`).join(' ')} fill="#d32f2f22" stroke="#d32f2f" strokeWidth={2.5 / view.k} />
                      {pts.map((p, i) => <circle key={i} cx={p[0] * plan.width} cy={p[1] * plan.height} r={4.5 / view.k} fill="#d32f2f" />)}
                    </g>
                  )}
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* ---------- צד שמאל: פרטים ---------- */}
        <div className="sidebox">
          <div className="card" style={{ margin: 0 }}>
            {selRoom ? (
              <>
                <h3>חלל נבחר</h3>
                <div className="grid" style={{ gap: 8 }}>
                  <label className="fld">שם<input value={selRoom.name} onChange={(e) => mut((a) => { a.rooms.find((r) => r.id === selRoom.id)!.name = e.target.value; })} /></label>
                  <label className="fld">ייעוד החלל
                    <select value={selRoom.type} onChange={(e) => mut((a) => { a.rooms.find((r) => r.id === selRoom.id)!.type = e.target.value as RoomType; })}>
                      {Object.entries(ROOM_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                  <label className="fld">שייך לדירה
                    <select value={selRoom.unitId ?? ''} onChange={(e) => mut((a) => { a.rooms.find((r) => r.id === selRoom.id)!.unitId = e.target.value ? Number(e.target.value) : null; })}>
                      <option value="">שטח משותף</option>
                      {unitsHere.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </label>
                </div>
                {metrics.get(selRoom.id) ? (
                  <table className="tbl" style={{ marginTop: 10 }}><tbody>
                    <tr><td>שטח</td><td className="num"><b>{fmt(metrics.get(selRoom.id)!.areaM2)} מ"ר</b></td></tr>
                    <tr><td>מידות (תיבה חוסמת)</td><td className="num">{fmt(metrics.get(selRoom.id)!.lengthM)} × {fmt(metrics.get(selRoom.id)!.widthM)} מ'{metrics.get(selRoom.id)!.rect ? '' : ' ≈'}</td></tr>
                    <tr><td>היקף</td><td className="num">{fmt(metrics.get(selRoom.id)!.perimeterM)} מ'</td></tr>
                  </tbody></table>
                ) : <p className="banner warn" style={{ marginTop: 10 }}>אין קנה מידה – כיילו כדי לחשב שטח.</p>}
                <button className="btn sm danger" style={{ marginTop: 10 }} onClick={() => { mut((a) => { a.rooms = a.rooms.filter((r) => r.id !== selRoom.id); }); setSel(null); }}>מחיקת חלל</button>
              </>
            ) : selOpening ? (
              <>
                <h3>פתח נבחר</h3>
                <table className="tbl"><tbody>
                  <tr><td>סוג</td><td>{OPENING_TYPES[selOpening.type]}</td></tr>
                  <tr><td>סימון</td><td>{selOpening.tag || '—'}</td></tr>
                  <tr><td>רוחב</td><td className="num">{fmt(selOpening.wM)} מ'</td></tr>
                  <tr><td>גובה</td><td className="num">{selOpening.hM ? fmt(selOpening.hM) + " מ'" : '—'}</td></tr>
                  {selOpening.sillM ? <tr><td>גובה אדן</td><td className="num">{fmt(selOpening.sillM)} מ'</td></tr> : null}
                  <tr><td>חלל</td><td>{draft?.rooms.find((r) => r.id === selOpening.room)?.name || '—'}</td></tr>
                </tbody></table>
                {selOpening.assumed && <p className="banner warn" style={{ marginTop: 8 }}>המידות הוערכו ולא נקראו מהתכנית.</p>}
                <button className="btn sm danger" style={{ marginTop: 8 }} onClick={() => { mut((a) => { a.openings = a.openings.filter((o) => o.id !== selOpening.id); }); setSel(null); }}>מחיקת פתח</button>
              </>
            ) : selFixture ? (
              <>
                <h3>אביזר נבחר</h3>
                <p><b>{FIXTURE_KINDS[selFixture.kind]?.label ?? selFixture.kind}</b></p>
                <p className="muted small">חלל: {draft?.rooms.find((r) => r.id === selFixture.room)?.name ?? '—'}</p>
                <button className="btn sm danger" onClick={() => { mut((a) => { a.fixtures = a.fixtures.filter((o) => o.id !== selFixture.id); }); setSel(null); }}>מחיקת אביזר</button>
              </>
            ) : (
              <>
                <h3>סיכום התכנית</h3>
                {!draft ? <p className="muted">התכנית טרם נותחה. לחצו על "נתח תכנית עם AI".</p> : (
                  <>
                    {draft.summary && <p className="small">{draft.summary}</p>}
                    <table className="tbl"><tbody>
                      <tr><td>חללים</td><td className="num">{draft.rooms.length}</td></tr>
                      <tr><td>פתחים</td><td className="num">{draft.openings.length}</td></tr>
                      <tr><td>אביזרים</td><td className="num">{draft.fixtures.length}</td></tr>
                      {plan?.mpp ? <tr><td>שטח כולל</td><td className="num"><b>{fmt([...metrics.values()].reduce((a, m) => a + (m?.areaM2 ?? 0), 0), 1)} מ"ר</b></td></tr> : null}
                    </tbody></table>
                    {draft.warnings?.map((w, i) => <p key={i} className="banner warn" style={{ marginTop: 8 }}>{w}</p>)}
                    <p className="muted small" style={{ marginTop: 8 }}>לחצו על חלל, פתח או אביזר בתכנית לפרטים ולעריכה.</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
