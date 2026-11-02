// הסשן הוא גיבוב של APP_PASSWORD; נבדק ב-middleware (Edge) באמצעות Web Crypto.
export async function sessionToken(): Promise<string> {
  const pw = process.env.APP_PASSWORD || '';
  const data = new TextEncoder().encode(`planiq-session-v1:${pw}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const COOKIE = 'planiq_session';
