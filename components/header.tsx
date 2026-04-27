'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
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

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-10 py-3">

        {/* LEFT SIDE */}
        <Link href="/" className="flex items-center gap-3">

          {/* 🔥 Bigger logo (using hosted image) */}
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

          <nav className="flex items-center gap-6 text-sm font-medium text-teal-700">
            <Link href="/">Dashboard</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/contacts">Contacts</Link>
            <Link href="/jobs">Jobs</Link>
          </nav>
        </div>

      </div>
    </header>
  );
}
