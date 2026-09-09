import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set(name, value, options) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicRoutes = [
    '/login',
    '/request-access',
    '/set-password',
    '/start',
    '/api/consumer-intake',
    // Customer-facing satisfaction rating — reached from an email link (no login), gated only
    // by the unguessable per-job token. (The admin send route /api/jobs/*/request-rating stays
    // protected — it's called from inside the authed app.)
    '/rate',
    '/api/rate',
  ];

  const isPublicRoute = publicRoutes.some(
    (route) => path === route || path.startsWith(`${route}/`)
  );

  // Scheduled jobs (Vercel Cron) and server-to-server callers authenticate with the
  // CRON_SECRET bearer, not a user session — let those through so the crons can actually
  // reach their routes (each route re-checks the secret). Without this the middleware would
  // redirect the cron to /login and the job would never run.
  const cronSecret = process.env.CRON_SECRET;
  const isCron =
    !!cronSecret && (req.headers.get('authorization') || '') === `Bearer ${cronSecret}`;

  if (!user && !isPublicRoute && !isCron) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|rex|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
