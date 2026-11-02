'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGEST = [
  'מה שטח כל דירה בפרויקט?',
  'כמה דלתות וחלונות יש ומה המידות?',
  'הרץ בדיקת תקנים והראה כשלים',
  'איך עובדת הכלי של סופר פוזיציה?',
];

export function readCtx(projectId: number | null) {
  if (!projectId) return {};
  try { return JSON.parse(localStorage.getItem(`planiq:ctx:${projectId}`) || '{}'); } catch { return {}; }
}
export function writeCtx(projectId: number, patch: Record<string, any>) {
  try { localStorage.setItem(`planiq:ctx:${projectId}`, JSON.stringify({ ...readCtx(projectId), ...patch })); } catch {}
}

export default function AgentChat() {
  const path = usePathname();
  const m = path.match(/^\/projects\/(\d+)/);
  const projectId = m ? Number(m[1]) : null;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy, open]);

  async function send(t?: string) {
    const content = (t ?? text).trim();
    if (!content || busy) return;
    const next = [...msgs, { role: 'user' as const, content }];
    setMsgs(next);
    setText('');
    setBusy(true);
    try {
      const r = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: { projectId, ...readCtx(projectId) } }),
      });
      const j = await r.json();
      setMsgs([...next, { role: 'assistant', content: j.reply || j.error || 'לא התקבלה תשובה' }]);
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: 'שגיאת תקשורת: ' + e.message }]);
    }
    setBusy(false);
  }

  if (!open) return <button className="btn primary agent-fab" onClick={() => setOpen(true)} title="פתיחת הסוכן החכם">🤖 הסוכן</button>;
  return (
    <div className="agent-panel" role="dialog" aria-label="הסוכן החכם">
      <div className="agent-head">
        <span>הסוכן החכם {projectId ? '' : '(בחרו פרויקט לנתונים)'}</span>
        <button className="btn sm" style={{ color: '#000' }} onClick={() => setOpen(false)}>סגירה</button>
      </div>
      <div className="agent-msgs">
        {msgs.length === 0 && (
          <>
            <div className="msg bot">שלום! אני הסוכן של PlanIQ. אני יכול לשלוף שטחים, כמויות, טבלת פתחים ותוצאות בדיקת תקנים מהפרויקט הפעיל, ולהסביר איך להשתמש במערכת. נסו:</div>
            <div className="suggest">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </>
        )}
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>{m.content}</div>)}
        {busy && <div className="msg bot muted">חושב…</div>}
        <div ref={end} />
      </div>
      <div className="agent-input">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="שאלו על התכניות, הכמויות או התקנים…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" onClick={() => send()} disabled={busy || !text.trim()}>שליחה</button>
      </div>
    </div>
  );
}
