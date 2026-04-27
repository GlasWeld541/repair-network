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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-10 py-4">

        {/* LEFT */}
        <Link href="/" className="flex items-center gap-4 group">
          
          <div className="relative h-10 w-10 flex-shrink-0">
            <Image
              src="https://glasweld.com/wp-content/uploads/2020/01/logo-footer.png"
              alt="GlasWeld"
              fill
              className="object-contain transition-transform duration-200 group-hover:scale-105"
              priority
            />
          </div>

          <div className="leading-tight">
            <div className="text-lg font-semibold tracking-tight text-slate-900">
              GlasWeld Repair Network™
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Repair-first claims control
            </div>
          </div>
        </Link>

        {/* RIGHT */}
        <div className="flex items-center gap-6">

          {/* SEARCH */}
          <form onSubmit={handleSubmit} className="hidden items-center gap-3 lg:flex">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business or contact"
              className="h-11 w-[260px] rounded-xl border border-slate-200 px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />

            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-11 w-[170px] rounded-xl border border-slate-200 px-4 text-sm shadow-sm focus:outline-none"
            >
              {stateOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800">
              Search
            </button>
          </form>

          {/* NAV */}
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            {[
              { href: '/', label: 'Dashboard' },
              { href: '/accounts', label: 'Accounts' },
              { href: '/contacts', label: 'Contacts' },
              { href: '/jobs', label: 'Jobs' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative transition hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* LOGOUT */}
          <button
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
          >
            Logout
          </button>

        </div>
      </div>
    </header>
  );
}