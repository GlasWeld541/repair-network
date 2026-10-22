'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/notifications';

export default function SetPasswordPage() {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  // Shop logins are invited with ?next=rex: once the password is set they go to Rex, where
  // providers work, instead of the Network login. Read before the URL is cleaned up below.
  const [toRex, setToRex] = useState(false);

  useEffect(() => {
    async function init() {
      setError('');

      const url = new URL(window.location.href);
      setToRex(url.searchParams.get('next') === 'rex');
      const code = url.searchParams.get('code');
      const hash = window.location.hash;

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message);
        } else {
          window.history.replaceState({}, document.title, '/set-password');
        }
      } else if (hash) {
        const params = new URLSearchParams(hash.replace('#', ''));

        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (sessionError) {
            setError(sessionError.message);
          } else {
            window.history.replaceState({}, document.title, '/set-password');
          }
        } else {
          setError('This password setup link is missing its security tokens.');
        }
      } else {
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          setError('This password setup link is expired or incomplete. Ask an admin to send a new invite.');
        }
      }

      setReady(true);
    }

    init();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      setLoading(false);
      setError('This password setup link is expired or incomplete. Ask an admin to send a new invite.');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (toRex) {
      // Signed in already (same site as /rex), so this opens Rex straight away.
      toast.success('Password set. Opening Rex.');
      window.location.href = '/rex/';
      return;
    }
    toast.success('Password set successfully. You can now log in.');
    window.location.href = '/login';
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-soft"
      >
        <h1 className="text-2xl font-semibold text-slate-900">
          Set Your Password
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          {toRex
            ? 'Create a password for GlasWeld Rex. You will use it with your email to sign in on any device.'
            : 'Create a password for your GlasWeld Repair Network account.'}
        </p>

        {error ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            required
          />

          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Set Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
