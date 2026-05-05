'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function login() {
    const cleanEmail = email.trim().toLowerCase();

    setError('');
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
      if (roleData.account_id) {
        router.replace(`/accounts/${roleData.account_id}`);
      } else {
        router.replace('/accounts');
      }

      router.refresh();
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            GlasWeld Repair Network
          </h1>
          <p className="mt-1 text-sm text-slate-500">Secure access</p>
        </div>

        <div className="space-y-4">
          <input
            className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-slate-500"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

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

          <button
            className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void login()}
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>

          {error ? (
            <p className="text-center text-sm text-red-600">{error}</p>
          ) : null}

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