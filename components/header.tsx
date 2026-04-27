'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type StateOption = {
  value: string;
  label: string;
};

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
};

export default function Header() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [stateOptions, setStateOptions] = useState<StateOption[]>([
    { value: '', label: 'All states' },
  ]);

  useEffect(() => {
    async function loadStates() {
      const { data } = await supabase
        .from('accounts')
        .select('state')
        .not('state', 'is', null);

      const uniqueStates = Array.from(
        new Set(
          ((data as { state: string | null }[]) ?? [])
            .map((row) => row.state?.trim().toUpperCase())
            .filter((v): v is string => Boolean(v))
        )
      ).sort();

      setStateOptions([
        { value: '', label: 'All states' },
        ...uniqueStates.map((value) => ({
          value,
          label: STATE_NAMES[value] ?? value,
        })),
      ]);
    }

    void loadStates();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    if (state) params.set('state', state);

    router.push(`/accounts${params.toString() ? `?${params}` : ''}`);
  };

  // 🔥 FIXED LOGOUT
  const handleLogout = async () => {
    await supabase.auth.signOut();

    // hard redirect avoids middleware weirdness
    window.location.href = '/login';
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-10 py-4">

        {/* LEFT SIDE */}
        <Link href="/" className="flex items-center gap-4">
          
          {/* 🔥 better logo spacing */}
          <div className="relative h-12 w-16 flex-shrink-0">
            <Image
              src="https://glasweld.com/wp-content/uploads/2020/01/logo-footer.png"
              alt="GlasWeld"
              fill
              className="object-contain object-left"
              priority
            />
          </div>

          {/* 🔥 better text spacing */}
          <div className="leading-tight">
            <div className="text-lg font-semibold text-slate-900">
              GlasWeld Repair Network™
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Reducing glass claim costs
            </div>
          </div>
        </Link>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-6">

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
              {stateOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button className="h-11 rounded-xl bg-slate-900 px-5 text-white">
              Search
            </button>
          </form>

          <nav className="flex items-center gap-6 text-sm font-medium text-teal-700">
            <Link href="/">Dashboard</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/contacts">Contacts</Link>
            <Link href="/jobs">Jobs</Link>
          </nav>

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