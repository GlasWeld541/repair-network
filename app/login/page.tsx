'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function login() {
    if (!email) return;

    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    if (error) {
      alert('Login failed. Try again.');
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg space-y-4">
        <h1 className="text-xl font-semibold text-center">
          GlasWeld Repair Network
        </h1>

        {!sent ? (
          <>
            <input
              className="w-full border rounded-lg p-2"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              className="w-full bg-black text-white py-2 rounded-lg"
              onClick={login}
            >
              Send Login Link
            </button>
          </>
        ) : (
          <p className="text-center text-sm text-slate-600">
            Check your email for the login link.
          </p>
        )}
      </div>
    </div>
  );
}
