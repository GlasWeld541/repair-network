'use client';

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
    setError('');
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setIsLoading(false);

    if (error) {
      setError(error.message || 'Invalid email or password');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
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
            className="w-full rounded-lg bg-black py-3 font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void login()}
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>

          {error ? (
            <p className="text-center text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}