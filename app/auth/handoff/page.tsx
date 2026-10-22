'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Signed in to Rex, open the Network without a second sign-in. Rex's own domain
 * (glasweld-rex.vercel.app) keeps its session in a cookie this domain can't read, so the Rex admin's
 * "Repair Network" and "People" links pass the session here in the URL fragment, which the browser
 * never sends to a server. This page signs in with it, drops it from the address bar and history,
 * and opens the page asked for. Public in the middleware: the visitor has no session here yet.
 */

// Only a path on this site, so the link can't be used to send someone elsewhere.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

export default function AuthHandoffPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const next = safeNext(params.get('next'));
    // Clear the tokens from the address bar before anything else.
    window.history.replaceState(null, '', window.location.pathname);
    if (!access_token || !refresh_token) {
      window.location.replace('/login');
      return;
    }
    void supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) {
        setFailed(true);
        window.location.replace('/login');
        return;
      }
      // A full load, so the middleware sees the new session cookie.
      window.location.replace(next);
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      {failed ? 'Please sign in to the Repair Network.' : 'Opening the Repair Network…'}
    </div>
  );
}
