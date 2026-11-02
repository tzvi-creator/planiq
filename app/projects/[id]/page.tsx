'use client';
import Link from 'next/link';
import { useState } from 'react';
import Help from '@/components/Help';
import { useProject } from '@/components/ProjectProvider';
import { DISCIPLINES, PLAN_KINDS, type Discipline, type PlanKind, type PlanMeta } from '@/lib/types';
import { pdfInfo, prepareImage, renderPdfPage } from '@/lib/clientFiles';
import { summarize } from '@/lib/quantities';
import { fmt } from '@/lib/geometry';

export default function Overview() {
  const { data, reload, floorId } = useProject();
  const pid = data.project.id;
  const [newFloor, setNewFloor] = useState('');
  const [newUnit, setNewUnit] = useState<Record<number, string>>({});
  const [upload, setUpload] = useState(false);
  const [edit, setEdit] = useState<PlanMeta | null>(null);
  const sum = summarize(data, {});

  const struct = (method: string, body?: any, qs = '') =>
    fetch(`/api/projects/${pid}/structure${qs}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(reload);

  const plans = data.plans.filter((p) => !floorId || p.floor_id === floorId || p.floor_id === null);
  const groups: [string, PlanMeta[]][] = [
    ...data.floors.filter((f) => !floorId || f.id === floorId).map((f) => [f.name, plans.filter((p) => p.floor_id === f.id)] as [string, PlanMeta[]]),
    ['חתכים, חזיתות ותכניות כלליות (ללא קומה)', plans.filter((p) => p.floor_id === null)],
  ];

  return (
    <div className="page">
      <Help
        title="סקירת הפרויקט והעלאת תכניות"
        intro="כאן מגדירים את מבנה הפרויקט (קומות ודירות) ומעלים את כל התכניות. כל תכנית משויכת לתחום (אדריכלות/חשמל/אינסטלציה/קונסטרוקציה) ולקומה, כדי שהמערכת תדע איך להשתמש בה."
        items={[
          ['הוספת קומה / דירה', 'הקלידו שם ולחצו "הוספה". דירות שייכות לקומה. הבחירה בסרגל העליון (קומה / דירה פעילה) קובעת על מה עובדים בשאר המסכים.'],
          ['העלאת תכנית', 'פותח חלון בחירת קובץ: PDF או תמונה (JPG/PNG). ב-PDF אפשר לבחור את העמוד. חובה לבחור תחום וקומה; אם ידוע קנה מידה (למשל 1:50) הזינו אותו – כך המערכת תחשב שטחים.'],
          ['קבצי DWG / DWF / DXF', 'ניתנים לשמירה בפרויקט, אך הצפייה והניתוח דורשים המרה ל-PDF (בכל תוכנת CAD: הדפסה ל-PDF בקנה מידה). המערכת תציג הודעה מתאימה.'],
          ['עריכה / מחיקה בשורת תכנית', 'שינוי שם, תחום, קומה וסוג (תכנית / חתך / חזית / פרט), או מחיקת התכנית.'],
          ['פתיחה', 'פותח את התכנית במסך "תכנית וחללים" לצפייה, מדידה וניתוח AI.'],
        ]}
      />

      <div className="card">
        <h2>{data.project.name}</h2>
        <p className="muted">{data.project.description}</p>
        <div className="kpis">
          <div className="kpi"><b>{data.floors.length}</b><span>קומות</span></div>
          <div className="kpi"><b>{data.units.length}</b><span>דירות</span></div>
          <div className="kpi"><b>{data.plans.length}</b><span>תכניות</span></div>
          <div className="kpi"><b>{data.plans.filter((p) => p.analysis).length}</b><span>תכניות מנותחות</span></div>
          <div className="kpi"><b>{fmt(sum.totalAreaM2, 1)}</b><span>מ"ר נטו (אדריכלות, כולל משותף)</span></div>
          <div className="kpi"><b>{sum.doors}/{sum.windows}</b><span>דלתות / חלונות</span></div>
        </div>
      </div>

      <div className="card">
        <h2>קומות ודירות</h2>
        <div className="grid c2">
          {data.floors.map((f) => (
            <div key={f.id} className="card" style={{ margin: 0, boxShadow: 'none' }}>
              <div className="row">
                <b className="grow">{f.name}</b>
                <button className="btn sm" onClick={() => { const n = prompt('שם חדש לקומה', f.name); if (n) struct('PATCH', { type: 'floor', id: f.id, name: n }); }}>שינוי שם</button>
                <button className="btn sm danger" onClick={() => confirm(`למחוק את ${f.name}? התכניות יישארו ללא קומה.`) && struct('DELETE', undefined, `?type=floor&id=${f.id}`)}>מחיקה</button>
              </div>
              <div className="spacer" />
              {data.units.filter((u) => u.floor_id === f.id).map((u) => (
                <div key={u.id} className="row" style={{ padding: '3px 0' }}>
                  <span className="chip">{u.name}</span>
                  <button className="btn sm" onClick={() => { const n = prompt('שם חדש לדירה', u.name); if (n) struct('PATCH', { type: 'unit', id: u.id, name: n }); }}>שינוי שם</button>
                  <button className="btn sm danger" onClick={() => confirm(`למחוק את ${u.name}?`) && struct('DELETE', undefined, `?type=unit&id=${u.id}`)}>✕</button>
                </div>
              ))}
              <div className="row" style={{ marginTop: 8 }}>
                <input placeholder="שם דירה חדשה" value={newUnit[f.id] || ''} onChange={(e) => setNewUnit({ ...newUnit, [f.id]: e.target.value })} />
                <button className="btn sm" disabled={!newUnit[f.id]?.trim()} onClick={() => { struct('POST', { type: 'unit', name: newUnit[f.id], floorId: f.id }); setNewUnit({ ...newUnit, [f.id]: '' }); }}>הוספת דירה</button>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="שם קומה חדשה (למשל: קומת קרקע)" value={newFloor} onChange={(e) => setNewFloor(e.target.value)} />
          <button className="btn" disabled={!newFloor.trim()} onClick={() => { struct('POST', { type: 'floor', name: newFloor }); setNewFloor(''); }}>הוספת קומה</button>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>תכניות הפרויקט</h2>
          <button className="btn primary" onClick={() => setUpload(true)}>⬆ העלאת תכנית</button>
        </div>
        {groups.map(([title, list]) => (
          <div key={title} style={{ marginTop: 14 }}>
            <h3>{title}</h3>
            {list.length === 0 ? <p className="muted small">אין תכניות.</p> : (
              <div className="tblwrap">
                <table className="tbl">
                  <thead><tr><th>שם</th><th>תחום</th><th>סוג</th><th>קנה מידה</th><th>ניתוח</th><th /></tr></thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.name}</b><div className="muted small">{p.filename}</div></td>
                        <td>{DISCIPLINES[p.discipline]}</td>
                        <td>{PLAN_KINDS[p.kind]}</td>
                        <td>{p.mpp ? <span className="chip ok">{p.scale_ratio ? `1:${p.scale_ratio}` : 'מכויל'}</span> : <span className="chip warn">לא ידוע</span>}</td>
                        <td>{p.analysis ? <span className="chip ok">נותח ({p.analysis.rooms.length} חללים, {p.analysis.fixtures.length} אביזרים)</span> : <span className="chip">טרם נותח</span>}</td>
                        <td className="row" style={{ justifyContent: 'flex-end' }}>
                          <Link className="btn sm primary" href={`/projects/${pid}/viewer?plan=${p.id}`}>פתיחה</Link>
                          <button className="btn sm" onClick={() => setEdit(p)}>עריכה</button>
                          <button className="btn sm danger" onClick={async () => { if (confirm(`למחוק את "${p.name}"?`)) { await fetch(`/api/plans/${p.id}`, { method: 'DELETE' }); reload(); } }}>מחיקה</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {upload && <UploadModal onClose={() => setUpload(false)} />}
      {edit && <EditModal plan={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const { data, reload, floorId } = useProject();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState<Discipline>('architecture');
  const [kind, setKind] = useState<PlanKind>('plan');
  const [fl, setFl] = useState<string>(floorId ? String(floorId) : data.floors[0] ? String(data.floors[0].id) : '');
  const [ratio, setRatio] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const ext = file?.name.split('.').pop()?.toLowerCase() || '';
  const isCad = ['dwg', 'dwf', 'dxf'].includes(ext);
  const isPdf = ext === 'pdf';

  async function pick(f: File | null) {
    setFile(f);
    if (!f) return;
    setName(f.name.replace(/\.[^.]+$/, ''));
    setPage(1);
    if (f.name.toLowerCase().endsWith('.pdf')) {
      try { setPages((await pdfInfo(f)).pages); } catch (e: any) { setMsg(e.message); }
    } else setPages(1);
  }

  async function go() {
    if (!file) return;
    setBusy(true); setMsg('מעבד את הקובץ…');
    try {
      const fd = new FormData();
      fd.set('projectId', String(data.project.id));
      fd.set('name', name || file.name);
      fd.set('filename', file.name + (isPdf && pages > 1 ? ` (עמוד ${page})` : ''));
      fd.set('discipline', discipline);
      fd.set('kind', kind);
      if (fl && kind === 'plan') fd.set('floorId', fl);
      else if (fl && kind !== 'plan' && confirm('לשייך גם חתך/חזית לקומה זו?')) fd.set('floorId', fl);
      if (ratio) fd.set('scaleRatio', ratio);
      if (isCad) {
        if (file.size > 4.3 * 1024 * 1024) throw new Error('הקובץ גדול מ-4.3MB');
        fd.set('file', file); fd.set('mime', 'application/octet-stream');
      } else {
        const r = isPdf ? await renderPdfPage(file, page) : await prepareImage(file);
        fd.set('file', r.blob, 'plan.jpg');
        fd.set('mime', 'image/jpeg');
        fd.set('width', String(r.width)); fd.set('height', String(r.height));
        if (r.paperWidthMm) fd.set('paperWidthMm', String(r.paperWidthMm));
      }
      setMsg('מעלה…');
      const res = await fetch('/api/plans', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'ההעלאה נכשלה');
      await reload();
      onClose();
    } catch (e: any) { setMsg('שגיאה: ' + e.message); setBusy(false); }
  }

  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>העלאת תכנית</h2>
        <div className="grid">
          <label className="fld">קובץ (PDF / JPG / PNG / DWG / DWF / DXF)
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg,.dwf,.dxf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
          {isCad && <div className="banner warn">קובצי CAD נשמרים בפרויקט, אך לא ניתן להציג או לנתח אותם ישירות. להמרה: הדפיסו ל-PDF בקנה מידה מתאים והעלו את ה-PDF.</div>}
          {isPdf && pages > 1 && (
            <label className="fld">עמוד להעלאה (מתוך {pages})<input type="number" min={1} max={pages} value={page} onChange={(e) => setPage(Number(e.target.value))} /></label>
          )}
          <label className="fld">שם התכנית<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid c2">
            <label className="fld">תחום
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>{Object.entries(DISCIPLINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="fld">סוג
              <select value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>{Object.entries(PLAN_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="fld">קומה / מפלס
              <select value={fl} onChange={(e) => setFl(e.target.value)}><option value="">ללא</option>{data.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </label>
            <label className="fld">קנה מידה 1:
              <input type="number" placeholder="למשל 50" value={ratio} onChange={(e) => setRatio(e.target.value)} />
            </label>
          </div>
          <p className="muted small">אם קנה המידה לא ידוע – אפשר לבצע כיול ידני במסך "תכנית וחללים" (מדידת קו ידוע).</p>
        </div>
        {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={!file || busy} onClick={go}>{busy ? <span className="spin" /> : 'העלאה'}</button>
          <button className="btn" disabled={busy} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ plan, onClose }: { plan: PlanMeta; onClose: () => void }) {
  const { data, reload } = useProject();
  const [f, setF] = useState({ name: plan.name, discipline: plan.discipline, kind: plan.kind, floor_id: plan.floor_id ? String(plan.floor_id) : '', scale_ratio: plan.scale_ratio ? String(plan.scale_ratio) : '' });
  async function save() {
    const body: any = { name: f.name, discipline: f.discipline, kind: f.kind, floor_id: f.floor_id ? Number(f.floor_id) : null };
    if (f.scale_ratio && Number(f.scale_ratio) !== plan.scale_ratio) {
      body.scale_ratio = Number(f.scale_ratio);
      if (plan.paper_width_mm && plan.scale_source !== 'manual') { body.mpp = ((plan.paper_width_mm / 1000) * Number(f.scale_ratio)) / plan.width; body.scale_source = 'ratio'; }
    }
    await fetch(`/api/plans/${plan.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await reload(); onClose();
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>עריכת תכנית</h2>
        <div className="grid">
          <label className="fld">שם<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <div className="grid c2">
            <label className="fld">תחום<select value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value as Discipline })}>{Object.entries(DISCIPLINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="fld">סוג<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PlanKind })}>{Object.entries(PLAN_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="fld">קומה<select value={f.floor_id} onChange={(e) => setF({ ...f, floor_id: e.target.value })}><option value="">ללא</option>{data.floors.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}</select></label>
            <label className="fld">קנה מידה 1:<input type="number" value={f.scale_ratio} onChange={(e) => setF({ ...f, scale_ratio: e.target.value })} /></label>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={save}>שמירה</button>
          <button className="btn" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
