'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Help from '@/components/Help';
import { useProject } from '@/components/ProjectProvider';
import { DISCIPLINES, type PlanMeta, type Pt } from '@/lib/types';
import { alignMatrix, detectConflicts, invertMat, applyMat, type Align, type Conflict } from '@/lib/superposition';

const COLORS = ['#e53935', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00'];
interface Layer { visible: boolean; opacity: number; color: string; align: Align }
interface ReportItem { title: string; detail: string; severity: string; img: string }
interface Report { title: string; date: string; project: string; layers: string[]; overview: string; items: ReportItem[]; aiSummary?: string }

export default function Superposition() {
  const { data, floorId } = useProject();
  const pid = data.project.id;
  const floors = data.floors;
  const [fl, setFl] = useState<number | null>(floorId ?? floors[0]?.id ?? null);
  useEffect(() => { if (floorId) setFl(floorId); }, [floorId]);

  const floorPlans = useMemo(() => data.plans.filter((p) => p.floor_id === fl && p.kind === 'plan' && p.mime.startsWith('image/')), [data.plans, fl]);
  const [baseId, setBaseId] = useState<number | null>(null);
  useEffect(() => { setBaseId(floorPlans.find((p) => p.discipline === 'architecture')?.id ?? floorPlans[0]?.id ?? null); }, [floorPlans]);
  const base = floorPlans.find((p) => p.id === baseId) || null;
  const overlays = useMemo(() => floorPlans.filter((p) => p.id !== baseId), [floorPlans, baseId]);

  const [layers, setLayers] = useState<Record<number, Layer>>({});
  useEffect(() => {
    setLayers((cur) => {
      const n: Record<number, Layer> = {};
      overlays.forEach((p, i) => { n[p.id] = cur[p.id] ?? { visible: true, opacity: 0.85, color: COLORS[i % COLORS.length], align: {} }; });
      return n;
    });
    // טעינת יישורים שמורים
    if (baseId) fetch(`/api/projects/${pid}/alignments`).then((r) => r.json()).then((rows: any[]) => {
      setLayers((cur) => {
        const n = { ...cur };
        for (const r of rows) if (r.base_plan_id === baseId && n[r.overlay_plan_id]) n[r.overlay_plan_id] = { ...n[r.overlay_plan_id], align: r.data };
        return n;
      });
    });
  }, [baseId, overlays.map((o) => o.id).join(',')]); // eslint-disable-line

  // ----- ציור -----
  const canvas = useRef<HTMLCanvasElement>(null);
  const imgs = useRef<Record<number, HTMLImageElement>>({});
  const [ready, setReady] = useState(0);
  useEffect(() => {
    for (const p of floorPlans) {
      if (imgs.current[p.id]) continue;
      const im = new Image();
      im.onload = () => setReady((x) => x + 1);
      im.src = `/api/plans/${p.id}/file`;
      imgs.current[p.id] = im;
    }
  }, [floorPlans]);

  const mats = useMemo(() => {
    const m: Record<number, ReturnType<typeof alignMatrix>> = {};
    if (base) for (const o of overlays) m[o.id] = alignMatrix(base, o, layers[o.id]?.align);
    return m;
  }, [base, overlays, layers]);

  const draw = useCallback((withMarks = true, markConflicts: Conflict[] = []) => {
    const c = canvas.current;
    if (!c || !base) return;
    const bi = imgs.current[base.id];
    if (!bi?.complete || !bi.naturalWidth) return;
    c.width = base.width; c.height = base.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.save(); ctx.globalAlpha = 0.5;
    ctx.drawImage(bi, 0, 0, base.width, base.height);
    ctx.restore();
    for (const o of overlays) {
      const L = layers[o.id], im = imgs.current[o.id];
      if (!L?.visible || !im?.complete || !im.naturalWidth) continue;
      const off = document.createElement('canvas');
      off.width = base.width; off.height = base.height;
      const oc = off.getContext('2d')!;
      oc.fillStyle = '#fff'; oc.fillRect(0, 0, off.width, off.height);
      const m = mats[o.id];
      oc.setTransform(m.a, m.b, -m.b, m.a, m.e, m.f);
      oc.drawImage(im, 0, 0, o.width, o.height);
      oc.setTransform(1, 0, 0, 1, 0, 0);
      oc.globalCompositeOperation = 'lighten';
      oc.fillStyle = L.color; oc.fillRect(0, 0, off.width, off.height);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = L.opacity;
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    }
    if (withMarks) {
      const r = Math.max(8, base.width / 120);
      ctx.lineWidth = r / 4;
      for (const [k, al] of Object.entries(layers).map(([id, L]) => [id, L.align] as const)) {
        for (const p of [al.b1, al.b2]) if (p) { ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(p[0] * base.width - r, p[1] * base.height); ctx.lineTo(p[0] * base.width + r, p[1] * base.height); ctx.moveTo(p[0] * base.width, p[1] * base.height - r); ctx.lineTo(p[0] * base.width, p[1] * base.height + r); ctx.stroke(); }
      }
      for (const cf of markConflicts) {
        ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r / 3;
        ctx.beginPath(); ctx.arc(cf.x * base.width, cf.y * base.height, r * 1.4, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }, [base, overlays, layers, mats]);

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selC, setSelC] = useState<Conflict | null>(null);
  useEffect(() => { draw(true, selC ? [selC] : conflicts); }, [draw, ready, conflicts, selC]);

  // ----- סימון נקודות ייחוס -----
  const [marking, setMarking] = useState<{ ovId: number; two: boolean; step: 'b1' | 'o1' | 'b2' | 'o2' } | null>(null);
  const [msg, setMsg] = useState('');
  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!marking || !base) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p: Pt = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    const ov = overlays.find((o) => o.id === marking.ovId)!;
    const L = layers[ov.id];
    const al: Align = { ...L.align };
    if (marking.step === 'b1') { al.b1 = p; al.o1 = undefined; al.b2 = undefined; al.o2 = undefined; }
    else if (marking.step === 'b2') al.b2 = p;
    else {
      // נקודה על השכבה המונחת: ממירים חזרה לקואורדינטות שלה לפי היישור הנוכחי
      const inv = invertMat(mats[ov.id]);
      const [ox, oy] = applyMat(inv, p[0] * base.width, p[1] * base.height);
      if (marking.step === 'o1') al.o1 = [ox / ov.width, oy / ov.height]; else al.o2 = [ox / ov.width, oy / ov.height];
    }
    setLayers({ ...layers, [ov.id]: { ...L, align: al } });
    const order: ('b1' | 'o1' | 'b2' | 'o2')[] = marking.two ? ['b1', 'o1', 'b2', 'o2'] : ['b1', 'o1'];
    const next = order[order.indexOf(marking.step) + 1];
    if (next) setMarking({ ...marking, step: next });
    else { setMarking(null); setMsg('היישור עודכן. אפשר לשמור אותו.'); }
  }
  const stepText = { b1: 'לחצו על נקודת ייחוס בתכנית הבסיס (למשל פינת עמוד או קיר)', o1: 'עכשיו לחצו על אותה נקודה בדיוק בתכנית המונחת (הצבעונית)', b2: 'נקודת ייחוס שנייה בתכנית הבסיס (רחוקה מהראשונה)', o2: 'אותה נקודה שנייה בתכנית המונחת' };

  async function saveAlign(ovId: number) {
    if (!baseId) return;
    await fetch(`/api/projects/${pid}/alignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basePlanId: baseId, overlayPlanId: ovId, data: layers[ovId].align }) });
    setMsg('היישור נשמר.');
  }

  // ----- התנגשויות -----
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const analyzed = overlays.filter((o) => layers[o.id]?.visible && o.analysis);
  function detect() {
    if (!base) return;
    if (!base.analysis) { setMsg('תכנית הבסיס טרם נותחה – נתחו אותה במסך "תכנית וחללים".'); return; }
    const found = detectConflicts(base, analyzed.map((p) => ({ plan: p, mat: mats[p.id] })));
    setConflicts(found); setSelC(null); setAiSummary('');
    setMsg(found.length ? `נמצאו ${found.length} התנגשויות / סתירות.` : 'לא נמצאו התנגשויות באמצעות הבדיקה האוטומטית.');
  }
  async function aiVision() {
    if (!base || !canvas.current) return;
    setAiBusy(true);
    draw(false);
    const tmp = document.createElement('canvas');
    const k = Math.min(1, 1800 / Math.max(base.width, base.height));
    tmp.width = base.width * k; tmp.height = base.height * k;
    tmp.getContext('2d')!.drawImage(canvas.current, 0, 0, tmp.width, tmp.height);
    const image = tmp.toDataURL('image/jpeg', 0.85);
    draw(true, conflicts);
    const r = await fetch('/api/superposition-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl: image, layers: [base, ...overlays.filter((o) => layers[o.id]?.visible)].map((p) => `${DISCIPLINES[p.discipline]}`).join(', '), found: conflicts.length }) });
    const j = await r.json();
    setAiBusy(false);
    if (!r.ok) { setMsg(j.error || 'שגיאה'); return; }
    setAiSummary(j.summary || '');
    const extra: Conflict[] = (j.issues || []).filter((i: any) => typeof i.x === 'number').map((i: any, n: number) => ({ id: 'ai' + n, severity: 'warn', title: 'AI: ' + i.title, detail: i.detail, x: i.x, y: i.y, planIds: [], source: 'ai' as const }));
    setConflicts((c) => [...c, ...extra]);
    setMsg(extra.length ? `ה-AI הוסיף ${extra.length} ממצאים לבדיקה ידנית.` : 'ה-AI לא זיהה ממצאים נוספים.');
  }

  // ----- דוח -----
  const [report, setReport] = useState<Report | null>(null);
  const [saved, setSaved] = useState<{ id: number; title: string; created_at: string }[]>([]);
  useEffect(() => { fetch(`/api/projects/${pid}/reports`).then((r) => r.json()).then(setSaved); }, [pid]);

  function cropOf(cf: Conflict): string {
    const c = canvas.current!;
    draw(true, [cf]);
    const w = Math.max(360, c.width / 4), h = (w * 3) / 4;
    const x0 = Math.min(Math.max(0, cf.x * c.width - w / 2), c.width - w), y0 = Math.min(Math.max(0, cf.y * c.height - h / 2), c.height - h);
    const t = document.createElement('canvas'); t.width = 480; t.height = 360;
    t.getContext('2d')!.drawImage(c, x0, y0, w, h, 0, 0, 480, 360);
    return t.toDataURL('image/jpeg', 0.8);
  }
  async function buildReport() {
    if (!base || !canvas.current) return;
    const list = conflicts.slice(0, 24);
    const items = list.map((cf) => ({ title: cf.title, detail: cf.detail, severity: cf.severity, img: cropOf(cf) }));
    draw(false);
    const ov = document.createElement('canvas'); const k = Math.min(1, 1400 / base.width);
    ov.width = base.width * k; ov.height = base.height * k;
    ov.getContext('2d')!.drawImage(canvas.current, 0, 0, ov.width, ov.height);
    const rep: Report = {
      title: `דוח סופר פוזיציה – ${data.project.name} – ${floors.find((f) => f.id === fl)?.name ?? ''}`,
      date: new Date().toLocaleString('he-IL'), project: data.project.name,
      layers: [base, ...overlays.filter((o) => layers[o.id]?.visible)].map((p) => `${p.name} (${DISCIPLINES[p.discipline]})`),
      overview: ov.toDataURL('image/jpeg', 0.8), items, aiSummary,
    };
    draw(true, conflicts);
    setReport(rep);
    const r = await fetch(`/api/projects/${pid}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: rep.title, content: rep }) });
    if (r.ok) { const row = await r.json(); setSaved((s) => [row, ...s]); setMsg('הדוח נוצר ונשמר. אפשר להדפיס אותו או לשמור כ-PDF.'); }
    else setMsg('הדוח נוצר אך לא נשמר (גודל גדול מדי). אפשר עדיין להדפיס.');
    setTimeout(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }
  async function openReport(id: number) {
    const r = await fetch(`/api/projects/${pid}/reports?reportId=${id}`);
    const j = await r.json();
    setReport(j.content);
    setTimeout(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  return (
    <div className="page" style={{ maxWidth: 1500 }}>
      <Help
        title="סופר פוזיציה – הלבשת תכניות זו על זו"
        intro="המערכת מניחה את תכניות החשמל, האינסטלציה והקונסטרוקציה על תכנית האדריכלות של אותה קומה, מזהה סתירות והתנגשויות ומפיקה דוח עם תמונות."
        items={[
          ['קומה ותכנית בסיס', 'בוחרים קומה; תכנית הבסיס (בדרך כלל אדריכלות) מוצגת באפור, ושאר התכניות של הקומה מונחות עליה בצבעים.'],
          ['שכבות', 'לכל תכנית מונחת: הצג/הסתר, צבע ושקיפות – כדי לראות היטב כל תחום.'],
          ['נקודת ייחוס (יישור)', 'אם התכניות לא מתלבשות במדויק: "נקודה אחת" – לחצו על נקודה בבסיס (פינת עמוד/קיר) ואז על אותה נקודה בתכנית המונחת; מזיז את התכנית. "שתי נקודות" – מתקן גם קנה מידה וסיבוב. "שמירה" שומרת את היישור לפרויקט.'],
          ['זהה התנגשויות', 'בדיקה אוטומטית על נתוני הניתוח: אביזרים מחוץ לחללים או בתוך פתחים, אינסטלציה בחדר לא רטוב, שקע ליד מקלחון, חפיפה לעמודים/קורות.'],
          ['ניתוח AI חזותי', 'שולח את תמונת החפיפה ל-AI שמחפש סתירות נוספות. ממצאי AI מסומנים לבדיקה ידנית.'],
          ['הפק דוח', 'יוצר דוח כתוב עם תמונות לכל ממצא (חיתוך מהחפיפה), נשמר בפרויקט וניתן להדפסה / שמירה כ-PDF.'],
        ]}
      />
      {msg && <div className="banner info" onClick={() => setMsg('')}>{msg}</div>}

      <div className="grid" style={{ gridTemplateColumns: '320px minmax(0,1fr)', alignItems: 'start' }}>
        <div>
          <div className="card">
            <label className="fld">קומה
              <select value={fl ?? ''} onChange={(e) => setFl(Number(e.target.value))}>{floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </label>
            <div className="spacer" />
            <label className="fld">תכנית בסיס
              <select value={baseId ?? ''} onChange={(e) => setBaseId(Number(e.target.value))}>{floorPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            {floorPlans.length < 2 && <p className="banner warn" style={{ marginTop: 8 }}>נדרשות לפחות שתי תכניות בקומה זו.</p>}
          </div>

          {overlays.map((o) => {
            const L = layers[o.id];
            if (!L) return null;
            const hasAlign = !!(L.align.b1 && L.align.o1);
            return (
              <div key={o.id} className="card">
                <div className="row">
                  <label className="chk grow"><input type="checkbox" checked={L.visible} onChange={(e) => setLayers({ ...layers, [o.id]: { ...L, visible: e.target.checked } })} /><b>{DISCIPLINES[o.discipline]}</b></label>
                  <input type="color" value={L.color} onChange={(e) => setLayers({ ...layers, [o.id]: { ...L, color: e.target.value } })} title="צבע השכבה" style={{ width: 36, height: 28, padding: 0 }} />
                </div>
                <div className="muted small">{o.name}</div>
                <label className="fld">שקיפות
                  <input type="range" min={0.1} max={1} step={0.05} value={L.opacity} onChange={(e) => setLayers({ ...layers, [o.id]: { ...L, opacity: Number(e.target.value) } })} />
                </label>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className={`chip ${hasAlign ? 'ok' : ''}`}>{hasAlign ? (L.align.b2 ? 'יישור: שתי נקודות' : 'יישור: נקודה אחת') : 'יישור אוטומטי'}</span>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn sm" onClick={() => setMarking({ ovId: o.id, two: false, step: 'b1' })}>נקודה אחת</button>
                  <button className="btn sm" onClick={() => setMarking({ ovId: o.id, two: true, step: 'b1' })}>שתי נקודות</button>
                  <button className="btn sm" onClick={() => setLayers({ ...layers, [o.id]: { ...L, align: {} } })}>איפוס</button>
                  <button className="btn sm primary" onClick={() => saveAlign(o.id)}>שמירה</button>
                </div>
                {!o.analysis && <p className="small" style={{ color: 'var(--warn)', marginTop: 6 }}>טרם נותחה – לא תיכלל בזיהוי התנגשויות.</p>}
              </div>
            );
          })}

          <div className="card">
            <button className="btn primary" style={{ width: '100%' }} onClick={detect} disabled={!base || !overlays.length}>🔍 זהה התנגשויות</button>
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={aiVision} disabled={aiBusy || !overlays.length}>{aiBusy ? <><span className="spin" /> בודק חזותית…</> : '🤖 ניתוח AI חזותי של החפיפה'}</button>
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={buildReport} disabled={!conflicts.length}>📄 הפק דוח עם תמונות</button>
            {saved.length > 0 && (
              <>
                <div className="small" style={{ fontWeight: 700, margin: '12px 0 4px' }}>דוחות שמורים</div>
                {saved.slice(0, 6).map((s) => <div key={s.id}><a href="#" onClick={(e) => { e.preventDefault(); openReport(s.id); }} className="small">{new Date(s.created_at).toLocaleString('he-IL')} – {s.title.slice(0, 40)}</a></div>)}
              </>
            )}
          </div>
        </div>

        <div>
          {marking && <div className="banner warn"><b>סימון יישור:</b> {stepText[marking.step]} <button className="btn sm" onClick={() => setMarking(null)}>ביטול</button></div>}
          <div className="card" style={{ padding: 8, overflow: 'auto', maxHeight: '75vh' }}>
            {!base ? <p className="muted" style={{ padding: 16 }}>אין תכניות להצגה בקומה זו.</p> : (
              <canvas ref={canvas} onClick={onCanvasClick} style={{ width: '100%', display: 'block', cursor: marking ? 'crosshair' : 'default' }} />
            )}
          </div>
          <div className="row small muted" style={{ marginTop: 6 }}>
            <span><i className="dot" style={{ background: '#999', display: 'inline-block' }} /> {base ? DISCIPLINES[base.discipline] : ''} (בסיס)</span>
            {overlays.filter((o) => layers[o.id]?.visible).map((o) => <span key={o.id}><i className="dot" style={{ background: layers[o.id]?.color, display: 'inline-block' }} /> {DISCIPLINES[o.discipline]}</span>)}
          </div>

          {conflicts.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h2>סתירות והתנגשויות ({conflicts.length})</h2>
              {aiSummary && <p className="banner info">{aiSummary}</p>}
              {conflicts.map((c) => (
                <div key={c.id} className="finding" style={selC?.id === c.id ? { background: 'var(--primary-l)' } : undefined} onClick={() => { setSelC(c); canvas.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
                  <span className={`sev ${c.severity}`}>{c.severity === 'fail' ? '✕' : '!'}</span>
                  <div><b>{c.title}</b> {c.source === 'ai' && <span className="chip warn">AI</span>}<div>{c.detail}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {report && (
        <div id="report" className="card pagebreak" style={{ marginTop: 16 }}>
          <div className="row noprint"><h2 className="grow" style={{ margin: 0 }}>הדוח</h2><button className="btn primary" onClick={() => window.print()}>🖨 הדפסה / שמירה כ-PDF</button><button className="btn" onClick={() => setReport(null)}>סגירה</button></div>
          <h1 style={{ marginTop: 10 }}>{report.title}</h1>
          <p className="muted">{report.date} · נבדקו: {report.layers.join(' | ')}</p>
          {report.aiSummary && <p>{report.aiSummary}</p>}
          <img src={report.overview} alt="חפיפה" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8 }} />
          <h2 style={{ marginTop: 18 }}>ממצאים ({report.items.length})</h2>
          {report.items.length === 0 && <p>לא נמצאו התנגשויות.</p>}
          {report.items.map((it, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', breakInside: 'avoid', flexWrap: 'nowrap' }}>
              <img src={it.img} alt="" style={{ width: 300, borderRadius: 8, border: '1px solid var(--border)' }} />
              <div><h3>{i + 1}. {it.title} <span className={`chip ${it.severity === 'fail' ? 'bad' : 'warn'}`}>{it.severity === 'fail' ? 'התנגשות' : 'לבדיקה'}</span></h3><p>{it.detail}</p></div>
            </div>
          ))}
          <p className="muted small" style={{ marginTop: 14 }}>הדוח נוצר אוטומטית ומהווה כלי עזר בלבד. יש לאמת כל ממצא מול התכניות המקוריות.</p>
        </div>
      )}
    </div>
  );
}
