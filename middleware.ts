import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const isLoggedIn = req.cookies.get('sb-access-token');

  // allow login page
  if (req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // if no session → redirect
  if (!isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};