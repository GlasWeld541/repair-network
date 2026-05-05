'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function login() {
    const cleanEmail = email.trim().toLowerCase();

    setError('');
    setMessage('');
    setIsLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError) {
      setIsLoading(false);
      setError(authError.message || 'Invalid email or password');
      return;
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role, approved, access_status, account_id')
      .eq('user_email', cleanEmail)
      .maybeSingle();

    if (roleError) {
      setIsLoading(false);
      setError(`Login succeeded, but access check failed: ${roleError.message}`);
      return;
    }

    if (!roleData) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError('Login succeeded, but no platform access profile was found.');
      return;
    }

    if (roleData.approved !== true) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError('Your access has not been approved yet.');
      return;
    }

    if ((roleData.access_status || 'Active') !== 'Active') {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError(`Your access is ${roleData.access_status || 'not active'}.`);
      return;
    }

    if (roleData.role === 'admin') {
      router.replace('/admin');
      router.refresh();
      return;
    }

    if (roleData.role === 'shop') {
      router.replace(roleData.account_id ? `/accounts/${roleData.account_id}` : '/accounts');
      router.refresh();
      return;
    }

    router.replace('/');
    router.refresh();
  }

  async function sendPasswordReset() {
    const cleanEmail = email.trim().toLowerCase();

    setError('');
    setMessage('');

    if (!cleanEmail) {
      setError('Enter your email address first.');
      return;
    }

    setIsLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: 'https://repair-network.vercel.app/set-password',
    });

    setIsLoading(false);

    if (resetError) {
      setError(resetError.message || 'Could not send reset email.');
      return;
    }

    setMessage('Password reset email sent. Check your inbox.');
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-32 bg-slate-950" />

        <div className="absolute inset-0 opacity-95 blur-[2px]">
          <div className="h-28 border-b border-slate-800 bg-slate-950 px-10">
            <div className="mx-auto flex h-full max-w-[1380px] items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="h-20 w-24 rounded-full bg-cyan-400/80 blur-sm" />
                <div>
                  <div className="h-4 w-52 rounded bg-white/80" />
                  <div className="mt-3 h-3 w-40 rounded bg-cyan-300/60" />
                </div>
              </div>

              <div className="hidden items-center gap-4 lg:flex">
                <div className="h-11 w-72 rounded-xl bg-white/10" />
                <div className="h-11 w-44 rounded-xl bg-white/10" />
                <div className="h-11 w-24 rounded-xl bg-cyan-400" />
                <div className="h-12 w-80 rounded-2xl bg-white/5" />
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-[1180px] px-6 py-14">
            <div className="grid gap-5 md:grid-cols-4">
              <div className="h-28 rounded-2xl border border-slate-200 bg-white shadow-xl" />
              <div className="h-28 rounded-2xl border border-slate-200 bg-white shadow-xl" />
              <div className="h-28 rounded-2xl border border-slate-200 bg-white shadow-xl" />
              <div className="h-28 rounded-2xl border border-slate-200 bg-white shadow-xl" />
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="h-16 border-b border-slate-200 bg-white" />
              <div className="space-y-3 p-5">
                <div className="h-12 rounded-xl bg-slate-100" />
                <div className="h-12 rounded-xl bg-slate-100" />
                <div className="h-12 rounded-xl bg-slate-100" />
                <div className="h-12 rounded-xl bg-slate-100" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-md" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_42%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-white/40 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-cyan-400" />

            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              GlasWeld Repair Network
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {mode === 'login'
                ? 'Secure access to claims, jobs, and repair network tools.'
                : 'Enter your email and we will send a secure reset link.'}
            </p>
          </div>

          <div className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-300 bg-white/90 p-3.5 text-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {mode === 'login' ? (
              <input
                className="w-full rounded-xl border border-slate-300 bg-white/90 p-3.5 text-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void login();
                }}
              />
            ) : null}

            {mode === 'login' ? (
              <button
                className="w-full rounded-xl bg-slate-950 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void login()}
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            ) : (
              <button
                className="w-full rounded-xl bg-slate-950 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void sendPasswordReset()}
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            )}

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            <div className="text-center text-sm">
              {mode === 'login' ? (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMessage('');
                    setMode('forgot');
                  }}
                  className="font-semibold text-blue-700 hover:underline"
                >
                  Forgot password?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMessage('');
                    setMode('login');
                  }}
                  className="font-semibold text-blue-700 hover:underline"
                >
                  Back to login
                </button>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
              Need access?{' '}
              <Link
                href="/request-access"
                className="font-semibold text-blue-700 hover:underline"
              >
                Request it here
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}