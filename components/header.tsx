'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/jobs', label: 'Jobs' },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

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
            .filter((value): value is string => Boolean(value))
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

    router.push(`/accounts${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.28)]">
      <div className="mx-auto flex max-w-[1380px] items-center justify-between px-10 py-4">

        {/* LEFT */}
        <Link href="/" className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg">
            <span className="text-sm font-bold text-white">GW</span>
          </div>

          <div>
            <div className="text-[17px] font-semibold tracking-tight text-white">
              GlasWeld Repair Network™
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">
              Claims Control Platform
            </div>
          </div>
        </Link>

        {/* RIGHT */}
        <div className="flex items-center gap-5">

          <form onSubmit={handleSubmit} className="hidden items-center gap-3 xl:flex">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business or contact"
              className="h-11 w-[290px] rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white placeholder:text-slate-400 focus:border-cyan-300/50 focus:bg-white/15 outline-none"
            />

            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-11 w-[175px] rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white focus:border-cyan-300/50 focus:bg-white/15 outline-none"
            >
              {stateOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button className="h-11 rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-cyan-300">
              Search
            </button>
          </form>

          <nav className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1 text-sm font-medium text-slate-300">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-4 py-2 transition ${
                    isActive
                      ? 'bg-white text-slate-950'
                      : 'hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            Logout
          </button>

        </div>
      </div>
    </header>
  );
}