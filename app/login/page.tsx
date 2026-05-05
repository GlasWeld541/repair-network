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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            GlasWeld Repair Network
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login' ? 'Secure access' : 'Reset your password'}
          </p>
        </div>

        <div className="space-y-4">
          <input
            className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-slate-500"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {mode === 'login' ? (
            <input
              className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-slate-500"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void login();
                }
              }}
            />
          ) : null}

          {mode === 'login' ? (
            <button
              className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void login()}
              disabled={isLoading}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          ) : (
            <button
              className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void sendPasswordReset()}
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          )}

          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-center text-sm text-emerald-700">{message}</p> : null}

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
  );
}