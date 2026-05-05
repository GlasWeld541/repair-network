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
    <div className="fixed inset-0 z-[9999] min-h-screen overflow-hidden bg-slate-950">
      <img
        src="/login-bg.png"
        alt=""
        className="absolute inset-0 h-full w-full scale-[1.02] object-cover opacity-90 blur-[3px]"
      />

      <div className="absolute inset-0 bg-slate-950/45" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_48%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-white/35 bg-white/88 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.55)] backdrop-blur-xl">
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

            <button
              className="w-full rounded-xl bg-slate-950 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => (mode === 'login' ? void login() : void sendPasswordReset())}
              disabled={isLoading}
            >
              {isLoading
                ? mode === 'login'
                  ? 'Logging in...'
                  : 'Sending...'
                : mode === 'login'
                  ? 'Login'
                  : 'Send Reset Link'}
            </button>

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