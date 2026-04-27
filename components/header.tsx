'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'AL', label: 'Alabama' },
  // ... (keep your full list exactly as is)
];

export default function Header() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) params.set('search', query.trim());
    if (state) params.set('state', state);

    router.push(`/accounts${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/'); // or '/login' if you have one
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-10 py-3">

        {/* LEFT SIDE */}
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-12 w-[140px]">
            <Image
              src="https://glasweld.com/wp-content/uploads/2020/01/logo-footer.png"
              alt="GlasWeld"
              fill
              className="object-contain object-left"
              priority
            />
          </div>

          <div>
            <div className="text-[16px] font-semibold text-slate-900">
              GlasWeld Repair Network™
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Reducing glass claim costs for carriers and subscribers
            </div>
          </div>
        </Link>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-5">

          {/* SEARCH */}
          <form onSubmit={handleSubmit} className="hidden items-center gap-3 lg:flex">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business or contact"
              className="h-11 w-[280px] rounded-xl border px-4 text-sm"
            />

            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-11 w-[180px] rounded-xl border px-4 text-sm"
            >
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <button className="h-11 rounded-xl bg-slate-900 px-5 text-white">
              Search
            </button>
          </form>

          {/* NAV */}
          <nav className="flex items-center gap-6 text-sm font-medium text-teal-700">
            <Link href="/">Dashboard</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/contacts">Contacts</Link>
            <Link href="/jobs">Jobs</Link>
          </nav>

          {/* LOGOUT */}
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Logout
          </button>

        </div>
      </div>
    </header>
  );
}