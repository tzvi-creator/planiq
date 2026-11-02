'use client';
import { useEffect, useMemo, useState } from 'react';
import Help from '@/components/Help';
import Crop from '@/components/Crop';
import { useProject } from '@/components/ProjectProvider';
import { DEFAULT_PARAMS, PARAM_LABELS, RULE_GROUPS, runChecks, type Finding, type Params } from '@/lib/standards';
import { downloadCsv } from '@/lib/quantities';

interface AiRes { findings: { requirement: string; status: string; detail: string; location: string | null }[]; summary: string; caveats: string }

export default function Standards() {
  const { data, floorId, unitId } = useProject();
  const [groups, setGroups] = useState<string[]>(RULE_GROUPS.map((g) => g.id));
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [showParams, setShowParams] = useState(false);
  const [filter, setFilter] = useState<'all' | 'fail' | 'warn' | 'pass'>('fail');
  const [result, setResult] = useState<Finding[] | null>(null);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [regs, setRegs] = useState('');
  const [ai, setAi] = useState<AiRes | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');

  useEffect(() => { try { const s = localStorage.getItem('planiq:params'); if (s) setParams({ ...DEFAULT_PARAMS, ...JSON.parse(s) }); } catch {} }, []);
  const saveParams = (p: Params) => { setParams(p); try { localStorage.setItem('planiq:params', JSON.stringify(p)); } catch {} };

  const run = () => { setResult(runChecks(data, groups, params, { floorId, unitId })); setSelected(null); };
  const counts = useMemo(() => ({ fail: result?.filter((r) => r.severity === 'fail').length ?? 0, warn: result?.filter((r) => r.severity === 'warn').length ?? 0, pass: result?.filter((r) => r.severity === 'pass').length ?? 0 }), [result]);
  const shown = (result || []).filter((r) => filter === 'all' || r.severity === filter);
  const plan = selected?.planId ? data.plans.find((p) => p.id === selected.planId) : null;

  async function runAi() {
    setAiBusy(true); setAiErr(''); setAi(null);
    const r = await fetch('/api/standards-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: data.project.id, regulations: regs, scope: { floorId, unitId } }) });
    const j = await r.json();
    setAiBusy(false);
    if (!r.ok) setAiErr(j.error || 'שגיאה'); else setAi(j);
  }

  return (
    <div className="page">
      <Help
        title="בדיקת תקנים"
        intro="בחרו אילו תקנות לבדוק, והמערכת תריץ את הבדיקות על נתוני התכניות בהיקף שנבחר (קומה/דירה בסרגל העליון)."
        items={[
          ['קבוצות תקנות', 'סמנו את הקבוצות שברצונכם לבדוק: שטחים, דלתות וחלונות, ממ"ד, חשמל, אינסטלציה.'],
          ['ערכי הבדיקה', 'כל הערכים (שטח מינימלי, רוחב דלת וכו\') הם ערכי ייחוס ברירת מחדל שניתנים לעריכה. חובה לאמת אותם מול נוסח התקנה/התקן העדכני – המערכת אינה תחליף לבודק רשמי.'],
          ['הרצת בדיקה', 'מחשבת ומציגה ממצאים: ❌ אי-עמידה, ⚠ אזהרה, ✓ עמידה. לחיצה על ממצא מציגה את המיקום בתכנית.'],
          ['בדיקת AI לתקנות חופשיות', 'הדביקו סעיפי תקנה/דרישה בטקסט חופשי, וה-AI יבדוק מולם את נתוני הפרויקט. אין בכך ייעוץ משפטי; יש לוודא את התוצאות.'],
          ['ייצוא', 'הורדת הממצאים ל-Excel (CSV).'],
        ]}
      />
      <div className="grid" style={{ gridTemplateColumns: '340px minmax(0,1fr)', alignItems: 'start' }}>
        <div>
          <div className="card">
            <h3>איזה תקנות לבדוק?</h3>
            {RULE_GROUPS.map((g) => (
              <label key={g.id} className="chk" style={{ display: 'flex', alignItems: 'flex-start', padding: '6px 0' }}>
                <input type="checkbox" checked={groups.includes(g.id)} onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))} style={{ marginTop: 5 }} />
                <span><b>{g.title}</b><br /><span className="muted small">{g.description}</span><br /><span className="muted small">מקור: {g.source}</span></span>
              </label>
            ))}
            <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={!groups.length}>▶ הרץ בדיקה</button>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowParams(!showParams)}>{showParams ? 'הסתר' : 'עריכת'} ערכי הבדיקה</button>
            {showParams && (
              <div className="grid" style={{ gap: 6, marginTop: 8 }}>
                <div className="banner warn small">ערכי ייחוס – אמתו מול התקנה העדכנית.</div>
                {(Object.keys(DEFAULT_PARAMS) as (keyof Params)[]).map((k) => (
                  <label key={k} className="fld">{PARAM_LABELS[k]}
                    <input type="number" step="0.05" value={params[k]} onChange={(e) => saveParams({ ...params, [k]: Number(e.target.value) })} />
                  </label>
                ))}
                <button className="btn sm" onClick={() => saveParams(DEFAULT_PARAMS)}>איפוס לברירת מחדל</button>
              </div>
            )}
          </div>
          <div className="card">
            <h3>בדיקת AI – תקנות חופשיות</h3>
            <textarea value={regs} onChange={(e) => setRegs(e.target.value)} placeholder={'הדביקו כאן סעיפי תקנה לבדיקה, למשל:\nשטח חדר רחצה לא יפחת מ-3.5 מ"ר\nרוחב דלת ממ"ד לא יפחת מ-0.8 מ\''} style={{ minHeight: 110 }} />
            <button className="btn" style={{ marginTop: 8 }} onClick={runAi} disabled={aiBusy || !regs.trim()}>{aiBusy ? <><span className="spin" /> בודק…</> : '🤖 בדוק עם AI'}</button>
            {aiErr && <p style={{ color: 'var(--bad)' }}>{aiErr}</p>}
          </div>
        </div>

        <div>
          {result === null ? (
            <div className="card"><p className="muted">בחרו תקנות ולחצו "הרץ בדיקה".</p></div>
          ) : (
            <div className="card">
              <div className="row">
                <h2 className="grow" style={{ margin: 0 }}>תוצאות</h2>
                <div className="seg">
                  <button className={filter === 'fail' ? 'on' : ''} onClick={() => setFilter('fail')}>❌ כשלים ({counts.fail})</button>
                  <button className={filter === 'warn' ? 'on' : ''} onClick={() => setFilter('warn')}>⚠ אזהרות ({counts.warn})</button>
                  <button className={filter === 'pass' ? 'on' : ''} onClick={() => setFilter('pass')}>✓ עומדים ({counts.pass})</button>
                  <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>הכול</button>
                </div>
                <button className="btn sm" onClick={() => downloadCsv(`בדיקת-תקנים-${data.project.name}.csv`, ['חומרה', 'קבוצה', 'בדיקה', 'פירוט'], result.map((r) => [r.severity === 'fail' ? 'כשל' : r.severity === 'warn' ? 'אזהרה' : 'עומד', RULE_GROUPS.find((g) => g.id === r.group)?.title ?? r.group, r.title, r.detail]))}>⬇ CSV</button>
              </div>
              {counts.fail === 0 && counts.warn === 0 && <div className="banner ok" style={{ marginTop: 10 }}>לא נמצאו כשלים באמצעות הבדיקות שנבחרו.</div>}
              <div className="grid" style={{ gridTemplateColumns: plan ? 'minmax(0,1fr) 340px' : '1fr', marginTop: 10, alignItems: 'start' }}>
                <div>
                  {shown.length === 0 && <p className="muted">אין ממצאים בקטגוריה זו.</p>}
                  {shown.map((f, i) => (
                    <div key={i} className="finding" style={selected === f ? { background: 'var(--primary-l)' } : undefined} onClick={() => setSelected(f)}>
                      <span className={`sev ${f.severity}`}>{f.severity === 'fail' ? '✕' : f.severity === 'warn' ? '!' : '✓'}</span>
                      <div><b>{f.title}</b><div className="small muted">{RULE_GROUPS.find((g) => g.id === f.group)?.title}</div><div>{f.detail}</div></div>
                    </div>
                  ))}
                </div>
                {plan && selected?.x !== undefined && (
                  <div style={{ position: 'sticky', top: 120 }}>
                    <div className="small" style={{ marginBottom: 4 }}><b>{plan.name}</b></div>
                    <Crop plan={plan} x={selected.x!} y={selected.y!} />
                  </div>
                )}
              </div>
            </div>
          )}

          {ai && (
            <div className="card">
              <h2>תוצאות בדיקת AI</h2>
              <p>{ai.summary}</p>
              <table className="tbl"><thead><tr><th>דרישה</th><th>סטטוס</th><th>פירוט</th><th>מיקום</th></tr></thead>
                <tbody>{ai.findings?.map((f, i) => <tr key={i}><td>{f.requirement}</td><td><span className={`chip ${f.status === 'pass' ? 'ok' : f.status === 'fail' ? 'bad' : 'warn'}`}>{f.status === 'pass' ? 'עומד' : f.status === 'fail' ? 'לא עומד' : 'לא ידוע'}</span></td><td>{f.detail}</td><td>{f.location}</td></tr>)}</tbody></table>
              {ai.caveats && <p className="banner warn" style={{ marginTop: 10 }}>{ai.caveats}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
