'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (r.ok) { router.push('/'); router.refresh(); }
    else setErr((await r.json().catch(() => ({}))).error || 'שגיאה');
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ fontSize: 26, marginBottom: 4 }}>PlanIQ</div>
        <p className="muted">מערכת חכמה לקריאת תכניות אדריכלות ויועצים</p>
        <div className="spacer" />
        <label className="fld">
          סיסמת כניסה
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus placeholder="הזינו את סיסמת המערכת" />
        </label>
        {err && <p style={{ color: 'var(--bad)', marginTop: 8 }}>{err}</p>}
        <div className="spacer" />
        <button className="btn primary" style={{ width: '100%' }} disabled={busy || !pw}>{busy ? 'נכנס…' : 'כניסה'}</button>
      </form>
    </div>
  );
}
