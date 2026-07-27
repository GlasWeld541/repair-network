'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type StateOption = {
  value: string;
  label: string;
};

type UserRole = 'admin' | 'shop' | 'carrier' | 'demo' | null;

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export default function Header() {
  const pathname = usePathname();

  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [stateOptions, setStateOptions] = useState<StateOption[]>([
    { value: '', label: 'All states' },
  ]);

  const [role, setRole] = useState<UserRole>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function loadRole() {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email?.toLowerCase();

      if (!email) {
        setRole(null);
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role, approved, access_status')
        .eq('user_email', email)
        .maybeSingle();

      if (data?.approved && data?.access_status === 'Active') {
        const normalizedRole = String(data.role || '').toLowerCase();

        if (
          normalizedRole === 'admin' ||
          normalizedRole === 'shop' ||
          normalizedRole === 'carrier' ||
          normalizedRole === 'demo'
        ) {
          setRole(normalizedRole as UserRole);
        }
      }
    }

    void loadRole();
    // Re-run on login/logout so the nav reflects auth state without a manual refresh.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadRole();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) params.set('search', query.trim());
    if (state.trim()) params.set('state', state.trim().toUpperCase());

    window.location.href = `/accounts${
      params.toString() ? `?${params.toString()}` : ''
    }`;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (pathname === '/start' || pathname.startsWith('/start/')) {
    return null;
  }

  // `external` items leave this Next app (e.g. the Rex SPA mounted at /rex via a rewrite)
  // so they render as a plain <a> — a real navigation, not client-side routing.
  type NavItem = { href: string; label: string; external?: boolean };

  const baseNavItems: NavItem[] = role
    ? [
        { href: '/', label: 'Dashboard' },
        { href: '/accounts', label: 'Accounts' },
        { href: '/jobs', label: 'Jobs' },
      ]
    : [{ href: '/start', label: 'Start' }];

  const navItems: NavItem[] =
    role === 'carrier'
      ? [
          { href: '/', label: 'Dashboard' },
          { href: '/claims', label: 'Claims' },
        ]
      : role === 'shop'
        ? baseNavItems
        : role === 'admin' || role === 'demo'
          ? [
              ...baseNavItems,
              { href: '/admin', label: 'Admin' },
              // Same login, same domain — jump straight to Rex (Pro Coach).
              { href: '/rex/', label: 'Rex', external: true },
            ]
          : baseNavItems;

  const renderNavLinks = (linkClass: (active: boolean) => string) =>
    navItems.map((item) => {
      const isActive =
        !item.external &&
        (item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(`${item.href}/`));

      return item.external ? (
        <a
          key={item.href}
          href={item.href}
          className={linkClass(isActive)}
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </a>
      ) : (
        <Link
          key={item.href}
          href={item.href}
          className={linkClass(isActive)}
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </Link>
      );
    });

  const searchForm = (className: string) => (
    <form onSubmit={handleSubmit} className={className}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search business or contact"
        className="h-11 rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white placeholder:text-slate-400 xl:w-[290px]"
      />

      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        className="h-11 rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white xl:w-[175px]"
      >
        {stateOptions.map((option) => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button className="h-11 rounded-xl bg-brand-300 px-5 text-sm font-semibold text-slate-950">
        Search
      </button>
    </form>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.28)]">
      <div className="mx-auto max-w-[1380px] px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-3 sm:gap-5"
            onClick={() => setMenuOpen(false)}
          >
            <div className="relative h-12 w-12 flex-shrink-0 sm:h-16 sm:w-16 lg:h-24 lg:w-24">
              <Image
                src="https://glasweld.com/wp-content/uploads/2020/01/logo-footer.png"
                alt="GlasWeld"
                fill
                className="object-contain object-left transition-transform duration-200 group-hover:scale-105"
                priority
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white sm:text-[17px]">
                GlasWeld Repair Network™
              </div>
              <div className="mt-1 hidden text-[10px] uppercase tracking-[0.32em] text-brand-200/80 sm:block">
                Claims Control Platform
              </div>
            </div>
          </Link>

          {/* Desktop cluster */}
          <div className="hidden items-center gap-5 lg:flex">
            {searchForm('hidden items-center gap-3 xl:flex')}

            <nav className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1 text-sm text-slate-300">
              {renderNavLinks(
                (active) =>
                  `rounded-xl px-4 py-2 ${
                    active ? 'bg-white text-slate-950' : 'hover:bg-white/10 hover:text-white'
                  }`,
              )}
            </nav>

            {role ? (
              <button
                onClick={handleLogout}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 hover:text-white"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu panel */}
        {menuOpen ? (
          <div className="mt-4 space-y-4 lg:hidden">
            <nav className="grid gap-1 text-sm">
              {renderNavLinks(
                (active) =>
                  `rounded-xl px-4 py-3 font-medium ${
                    active ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10'
                  }`,
              )}
            </nav>

            {searchForm('grid gap-2')}

            {role ? (
              <button
                onClick={handleLogout}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Login
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
