'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AgentChat from './AgentChat';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  if (path === '/login') return <>{children}</>;
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          PlanIQ<span>קריאת תכניות חכמה</span>
        </Link>
        <div className="grow" />
        <Link href="/" className="btn sm">כל הפרויקטים</Link>
        <button className="btn sm" onClick={logout} title="יציאה מהמערכת">יציאה</button>
      </header>
      {children}
      <AgentChat />
    </>
  );
}
