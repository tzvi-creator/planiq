'use client';
import { useEffect, useMemo, useState } from 'react';
import Help from '@/components/Help';
import Markdown from '@/components/Markdown';
import { useProject } from '@/components/ProjectProvider';
import { SPEC_SECTIONS, deriveSpecFacts, specCompleteness } from '@/lib/specForm';

interface SpecRow { id: number; created_at: string; content: string }

export default function SpecPage() {
  const { data } = useProject();
  const pid = data.project.id;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [cur, setCur] = useState<SpecRow | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const facts = useMemo(() => deriveSpecFacts(data), [data]);
  const comp = specCompleteness(answers);

  useEffect(() => {
    fetch(`/api/projects/${pid}/spec`).then((r) => r.json()).then((j) => { setAnswers(j.answers || {}); setSpecs(j.specs || []); setCur(j.specs?.[0] ?? null); });
  }, [pid]);

  const set = (k: string, v: string) => { setAnswers((a) => ({ ...a, [k]: v })); setSaved(false); };
  async function save() {
    await fetch(`/api/projects/${pid}/spec`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
    setSaved(true);
  }
  async function generate() {
    setBusy(true); setErr('');
    await save();
    const r = await fetch(`/api/projects/${pid}/spec`, { method: 'POST' });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || 'שגיאה'); return; }
    setSpecs([j, ...specs]); setCur(j);
    setTimeout(() => document.getElementById('spec-out')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }
  function download() {
    if (!cur) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + cur.content], { type: 'text/markdown;charset=utf-8' }));
    a.download = `מפרט-מכר-${data.project.name}.md`;
    a.click();
  }

  return (
    <div className="page">
      <Help
        title="מפרט מכר (חוק המכר – דירות)"
        intro="המערכת מוציאה מהתכניות את כל מה שאפשר (שטחים, פתחים, כמויות חשמל ואינסטלציה). מה שלא ניתן לדעת מתכניות – נשאל בטופס. לאחר המילוי ה-AI מרכיב מפרט מלא."
        items={[
          ['נתונים מהתכניות (הלוח הימני)', 'נגזרים אוטומטית ואינם דורשים מילוי. אם הם ריקים – נתחו את התכניות במסך "תכנית וחללים".'],
          ['הטופס', 'שדות שלא ניתנים להפקה מתכניות: חומרי גמר, יצרנים, תקנים, אחריות וכו\'. שדה שיישאר ריק יסומן במפרט כ"נדרש להשלמה".'],
          ['שמירת תשובות', 'שומר את הטופס בפרויקט (הוא גם נשמר אוטומטית בעת יצירת מפרט).'],
          ['צור מפרט מכר', 'שולח ל-AI את הנתונים והתשובות ומקבל מפרט מסודר לפי סעיפי הטופס שבתקנות. נוצר גרסה חדשה בכל לחיצה.'],
          ['הדפסה / הורדה', 'הדפסה (או שמירה כ-PDF) והורדה כקובץ Markdown לעריכה ב-Word.'],
          ['שימו לב', 'המפרט הוא טיוטה: חובה לבדיקת עורך דין ואדריכל/מהנדס לפני חתימה.'],
        ]}
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px', alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="row">
              <h2 className="grow" style={{ margin: 0 }}>טופס השלמת נתונים למפרט</h2>
              <span className="chip">{comp.filled}/{comp.total} שדות מולאו</span>
            </div>
            <div className="progress" style={{ margin: '10px 0 4px' }}><i style={{ width: `${(comp.filled / comp.total) * 100}%` }} /></div>
          </div>
          {SPEC_SECTIONS.map((s) => (
            <div key={s.id} className="card">
              <h3>{s.title}</h3>
              <div className="grid c2">
                {s.fields.map((f) => (
                  <label key={f.key} className="fld" style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                    {f.label}
                    {f.type === 'textarea'
                      ? <textarea value={answers[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
                      : <input value={answers[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="card row">
            <button className="btn" onClick={save} disabled={saved}>{saved ? 'נשמר ✓' : 'שמירת תשובות'}</button>
            <button className="btn primary" onClick={generate} disabled={busy}>{busy ? <><span className="spin" /> יוצר מפרט… (עד דקה)</> : '📄 צור מפרט מכר'}</button>
            {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
          </div>
        </div>

        <div style={{ position: 'sticky', top: 120 }}>
          <div className="card">
            <h3>נתונים שנגזרו מהתכניות</h3>
            {facts.length <= 2 && <div className="banner warn">לא נמצאו נתונים מנותחים.</div>}
            <table className="tbl"><tbody>{facts.map((f) => <tr key={f.key}><td>{f.label}</td><td className="num"><b>{f.value}</b></td></tr>)}</tbody></table>
          </div>
        </div>
      </div>

      <div id="spec-out" className="card" style={{ marginTop: 14 }}>
        <div className="row noprint">
          <h2 className="grow" style={{ margin: 0 }}>המפרט שנוצר</h2>
          {specs.length > 1 && (
            <select value={cur?.id} onChange={(e) => setCur(specs.find((s) => s.id === Number(e.target.value)) ?? null)}>
              {specs.map((s) => <option key={s.id} value={s.id}>גרסה {new Date(s.created_at).toLocaleString('he-IL')}</option>)}
            </select>
          )}
          <button className="btn sm" disabled={!cur} onClick={() => window.print()}>🖨 הדפסה</button>
          <button className="btn sm" disabled={!cur} onClick={download}>⬇ הורדה</button>
        </div>
        {cur ? <Markdown text={cur.content} /> : <p className="muted">עדיין לא נוצר מפרט. מלאו את הטופס ולחצו "צור מפרט מכר".</p>}
      </div>
    </div>
  );
}
