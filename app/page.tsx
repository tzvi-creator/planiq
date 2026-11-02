'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Help from '@/components/Help';

interface Row { id: number; name: string; address: string | null; description: string | null; plan_count: number; floor_count: number; unit_count: number }

export default function Home() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState({ name: '', address: '', description: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/projects').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name.trim()) return;
    setBusy(true);
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setBusy(false);
    if (r.ok) { setForm({ name: '', address: '', description: '' }); setShow(false); load(); }
  }
  async function del(id: number, name: string) {
    if (!confirm(`למחוק את הפרויקט "${name}" על כל התכניות שלו? לא ניתן לשחזר.`)) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="page">
      <Help
        title="הפרויקטים שלי"
        intro="פרויקט הוא היחידה המרכזית: בתוכו מגדירים קומות ודירות, ומעלים את כל התכניות (אדריכלות, חשמל, אינסטלציה, קונסטרוקציה, חתכים וחזיתות)."
        items={[
          ['פרויקט חדש', 'פותח טופס ליצירת פרויקט. אחרי היצירה כנסו אליו כדי להגדיר קומות ודירות ולהעלות תכניות.'],
          ['לחיצה על כרטיס פרויקט', 'פותחת את הפרויקט: סקירה, צפייה בתכניות, כמויות, תקנים וסופר פוזיציה.'],
          ['מחיקה', 'מוחקת פרויקט לצמיתות, כולל כל התכניות והניתוחים שלו (תתבקשו לאשר).'],
          ['🤖 הסוכן', 'הכפתור בפינה השמאלית התחתונה פותח צ\'אט עם סוכן ה-AI שיודע לענות על נתוני הפרויקט הפעיל.'],
        ]}
      />
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 className="grow" style={{ margin: 0 }}>הפרויקטים שלי</h1>
        <button className="btn primary" onClick={() => setShow(true)}>＋ פרויקט חדש</button>
      </div>

      {rows === null ? <p className="muted">טוען…</p> : rows.length === 0 ? <div className="card">אין פרויקטים עדיין. לחצו על "פרויקט חדש".</div> : (
        <div className="grid c3">
          {rows.map((p) => (
            <div key={p.id} className="card pcard">
              <Link href={`/projects/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <h2>{p.name}</h2>
                <p className="muted small">{p.address || 'ללא כתובת'}</p>
                <p className="small" style={{ minHeight: 40 }}>{p.description}</p>
                <div className="row">
                  <span className="chip">{p.floor_count} קומות</span>
                  <span className="chip">{p.unit_count} דירות</span>
                  <span className="chip ok">{p.plan_count} תכניות</span>
                </div>
              </Link>
              <div className="row" style={{ marginTop: 10 }}>
                <Link className="btn sm primary" href={`/projects/${p.id}`}>פתיחה</Link>
                <button className="btn sm danger" onClick={() => del(p.id, p.name)}>מחיקה</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {show && (
        <div className="modal-back" onClick={() => setShow(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>פרויקט חדש</h2>
            <div className="grid">
              <label className="fld">שם הפרויקט *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>
              <label className="fld">כתובת<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              <label className="fld">תיאור<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={create} disabled={busy || !form.name.trim()}>יצירה</button>
              <button className="btn" onClick={() => setShow(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
