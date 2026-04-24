'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const ALLOWED_EMAILS = [
  'derek@glasweld.com',
  // add others here
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setError('');

    if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
      setError('Access denied');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    if (error) {
      setError('Login failed');
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">
            GlasWeld Repair Network
          </h1>
          <p className="text-sm text-slate-500">
            Authorized access only
          </p>
        </div>

        {!sent ? (
          <>
            <input
              className="w-full border rounded-lg p-3 text-center"
              placeholder="your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              className="w-full bg-black text-white py-3 rounded-lg font-medium hover:opacity-90"
              onClick={login}
            >
              Send Secure Login Link
            </button>

            {error && (
              <p className="text-center text-sm text-red-500">{error}</p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-slate-600">
            Check your email for your secure login link.
          </p>
        )}
      </div>
    </div>
  );
}