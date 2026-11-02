import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, sessionToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) return NextResponse.next();
  if (!process.env.APP_PASSWORD) return new NextResponse('APP_PASSWORD לא הוגדר בשרת', { status: 500 });
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await sessionToken())) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
