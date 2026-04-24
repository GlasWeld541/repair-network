'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function login() {
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Invalid email or password');
      return;
    }

    // redirect after login
    window.location.href = '/';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl space-y-6">
        
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">
            GlasWeld Repair Network
          </h1>
          <p className="text-sm text-slate-500">
            Secure access
          </p>
        </div>

        <input
          className="w-full border rounded-lg p-3"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full border rounded-lg p-3"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="w-full bg-black text-white py-3 rounded-lg font-medium hover:opacity-90"
          onClick={login}
        >
          Login
        </button>

        {error && (
          <p className="text-center text-sm text-red-500">
            {error}
          </p>
        )}

      </div>
    </div>
  );
}