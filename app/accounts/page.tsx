'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { distanceMiles } from '@/lib/geo';

const YES_NO_UNKNOWN = ['Unknown', 'Yes', 'No'] as const;
const OUTREACH_OPTIONS = [
  'Not Contacted',
  'Contacted',
  'Qualified',
  'Onboarded',
  'In Progress',
] as const;

type AccountRow = {
  id: string;
  account_name: string | null;
  city: string | null;
  state: string | null;
  glasweld_certified: string | null;
  insurance: string | null;
  uses_onyx: string | null;
  uses_zoom_injector: string | null;
  repair_only: string | null;
  outreach_status: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean | null;
  provider_type: string | null;
};

type AccountWithDistance = AccountRow & { distance: number | null };

type Role = 'admin' | 'shop' | 'carrier' | 'demo' | null;

const RADIUS_OPTIONS = [10, 25, 50, 100, 250] as const;

function AccountsPageContent() {
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'disabled' | 'all'>('active');

  // Proximity ("near ZIP/city within N miles") — geocode the entered origin once, then
  // rank/filter accounts by Haversine distance. Reuses /api/geocode + lib/geo, the same
  // machinery the claim auto-router uses.
  const [nearQuery, setNearQuery] = useState('');
  const [radius, setRadius] = useState<number>(50);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [nearError, setNearError] = useState('');

  const isReadOnly = role === 'demo';

  async function runProximity() {
    const q = nearQuery.trim();
    setNearError('');
    if (!q) {
      setOrigin(null);
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        latitude: number | null;
        longitude: number | null;
      };
      if (data.latitude == null || data.longitude == null) {
        setOrigin(null);
        setNearError(`Couldn't locate "${q}". Try a ZIP code or "City, ST".`);
        return;
      }
      setOrigin({ latitude: data.latitude, longitude: data.longitude });
    } catch {
      setOrigin(null);
      setNearError('Location lookup failed. Please try again.');
    } finally {
      setGeocoding(false);
    }
  }

  function clearProximity() {
    setNearQuery('');
    setOrigin(null);
    setNearError('');
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    setQuery(searchParams.get('search') || '');
    setStateFilter((searchParams.get('state') || '').trim().toUpperCase());
  }, [searchParams]);

  async function loadAccounts() {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (!roleData || !roleData.approved || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    if (roleData.role === 'carrier') {
      window.location.href = '/claims';
      return;
    }

    setRole(roleData.role);

    if (roleData.role === 'admin' || roleData.role === 'demo') {
      const { data } = await supabase
        .from('accounts')
        .select(
          'id, account_name, city, state, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status, latitude, longitude, active, provider_type'
        )
        .order('account_name');

      setAccounts((data as AccountRow[]) || []);
      return;
    }

    const { data: shopData } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    if (!shopData?.account_id) {
      setAccounts([]);
      return;
    }

    const { data } = await supabase
      .from('accounts')
      .select(
        'id, account_name, city, state, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status'
      )
      .eq('id', shopData.account_id);

    setAccounts((data as AccountRow[]) || []);
  }

  async function updateAccount(
    id: string,
    field: keyof AccountRow,
    value: string
  ) {
    if (isReadOnly) return;

    await supabase
      .from('accounts')
      .update({ [field]: value })
      .eq('id', id);

    setAccounts((current) =>
      current.map((account) =>
        account.id === id ? { ...account, [field]: value } : account
      )
    );
  }

  async function setAccountActive(id: string, active: boolean) {
    if (isReadOnly) return;

    await supabase.from('accounts').update({ active }).eq('id', id);

    setAccounts((current) =>
      current.map((account) => (account.id === id ? { ...account, active } : account))
    );
  }

  const filteredAccounts = useMemo<AccountWithDistance[]>(() => {
    const q = query.trim().toLowerCase();
    const city = cityFilter.trim().toLowerCase();

    const base = accounts.filter((account) => {
      const haystack = [
        account.account_name ?? '',
        account.city ?? '',
        account.state ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const matchesState =
        !stateFilter || (account.state || '').toUpperCase() === stateFilter;
      const matchesCity = !city || (account.city || '').toLowerCase().includes(city);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active'
          ? account.active !== false
          : account.active === false);

      return matchesSearch && matchesState && matchesCity && matchesStatus;
    });

    // No proximity origin set → return as-is, no distance.
    if (!origin) {
      return base.map((account) => ({ ...account, distance: null }));
    }

    // Proximity active → keep only mapped accounts within the radius, nearest first.
    return base
      .map((account) => ({
        ...account,
        distance:
          account.latitude != null && account.longitude != null
            ? distanceMiles(
                origin.latitude,
                origin.longitude,
                Number(account.latitude),
                Number(account.longitude)
              )
            : null,
      }))
      .filter((account) => account.distance != null && account.distance <= radius)
      .sort((a, b) => (a.distance as number) - (b.distance as number));
  }, [accounts, query, cityFilter, stateFilter, statusFilter, origin, radius]);

  const showDistance = origin != null;
  const unmappedCount = useMemo(
    () => accounts.filter((a) => a.latitude == null || a.longitude == null).length,
    [accounts]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Accounts</h1>
          <p className="text-sm text-slate-500">
            {role === 'admin'
              ? 'Full access'
              : role === 'demo'
                ? 'Demo view only'
                : 'You only have access to your assigned account.'}
          </p>
        </div>

        {isReadOnly ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            View Only
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, city, or state"
              className="h-10 w-56 rounded-xl border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">City</span>
            <input
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="e.g. Beaverton"
              className="h-10 w-40 rounded-xl border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">State</span>
            <input
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
              placeholder="OR"
              maxLength={2}
              className="h-10 w-20 rounded-xl border border-slate-300 px-3 text-sm uppercase"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'active' | 'disabled' | 'all')}
              className="h-10 w-32 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="all">All</option>
            </select>
          </label>

          <div className="hidden w-px self-stretch bg-slate-200 sm:block" aria-hidden />

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Near (ZIP or city)</span>
            <input
              value={nearQuery}
              onChange={(e) => setNearQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runProximity();
              }}
              placeholder="97005 or Beaverton, OR"
              className="h-10 w-52 rounded-xl border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Radius</span>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              aria-label="Radius in miles"
              className="h-10 w-24 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} mi
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void runProximity()}
            disabled={geocoding}
            className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {geocoding ? 'Locating…' : 'Search nearby'}
          </button>
          {origin ? (
            <button
              type="button"
              onClick={clearProximity}
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {nearError ? <p className="text-sm text-rose-600">{nearError}</p> : null}

      <p className="text-sm text-slate-500">
        {showDistance
          ? `${filteredAccounts.length} shop${filteredAccounts.length === 1 ? '' : 's'} within ${radius} mi of "${nearQuery.trim()}"${
              unmappedCount
                ? ` · ${unmappedCount} unmapped shop${unmappedCount === 1 ? '' : 's'} hidden`
                : ''
            }`
          : `${filteredAccounts.length} account${filteredAccounts.length === 1 ? '' : 's'}`}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1180px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">State</th>
              {showDistance ? <th className="px-4 py-3">Distance</th> : null}
              <th className="px-4 py-3">Certified</th>
              <th className="px-4 py-3">Insurance</th>
              <th className="px-4 py-3">Onyx</th>
              <th className="px-4 py-3">Zoom</th>
              <th className="px-4 py-3">Repair Only</th>
              <th className="px-4 py-3">Outreach</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {filteredAccounts.map((account) => (
              <tr
                key={account.id}
                className={`border-t hover:bg-slate-50 ${
                  account.active === false ? 'opacity-60' : ''
                }`}
              >
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {account.account_name || 'Unnamed Account'}
                    </Link>
                    {account.provider_type === 'independent_tech' ? (
                      <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                        Ind. tech
                      </span>
                    ) : null}
                  </div>
                </td>

                <td className="px-4 py-3">{account.city || '—'}</td>
                <td className="px-4 py-3">{account.state || '—'}</td>

                {showDistance ? (
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {account.distance != null ? `${account.distance.toFixed(1)} mi` : '—'}
                  </td>
                ) : null}

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.glasweld_certified || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'glasweld_certified', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.insurance || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'insurance', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.uses_onyx || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'uses_onyx', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.uses_zoom_injector || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'uses_zoom_injector', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.repair_only || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'repair_only', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.outreach_status || 'Not Contacted'}
                    options={OUTREACH_OPTIONS}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'outreach_status', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        account.active === false
                          ? 'border-slate-200 bg-slate-100 text-slate-500'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {account.active === false ? 'Disabled' : 'Active'}
                    </span>
                    {!isReadOnly ? (
                      <button
                        type="button"
                        onClick={() =>
                          void setAccountActive(account.id, account.active === false)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        {account.active === false ? 'Enable' : 'Disable'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {!filteredAccounts.length && (
              <tr>
                <td
                  colSpan={showDistance ? 11 : 10}
                  className="py-10 text-center text-slate-500"
                >
                  {showDistance
                    ? `No mapped shops within ${radius} mi. Widen the radius or clear the proximity search.`
                    : 'No accounts match your filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableCell({
  value,
  options,
  readOnly,
  onChange,
}: {
  value: string;
  options: readonly string[];
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  if (readOnly) {
    return (
      <span className="text-sm text-slate-900">
        {value || '—'}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <AccountsPageContent />
    </Suspense>
  );
}
