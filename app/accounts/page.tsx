'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast, useConfirm } from '@/components/ui/notifications';
import { distanceMiles } from '@/lib/geo';
import { Skeleton, SkeletonRows, ListPageSkeleton } from '@/components/ui/skeleton';

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
  offers_financing: boolean | null;
  outreach_status: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean | null;
  provider_type: string | null;
};

type AccountWithDistance = AccountRow & { distance: number | null };

type Role = 'admin' | 'shop' | 'carrier' | 'demo' | null;

const RADIUS_OPTIONS = [10, 25, 50, 100, 250] as const;
const PAGE_SIZE = 50;
const ADMIN_COLS =
  'id, account_name, city, state, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, offers_financing, outreach_status, latitude, longitude, active, provider_type';

function AccountsPageContent() {
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'disabled' | 'all'>('active');

  // Server-side pagination (the network now has thousands of accounts — fetching all at once
  // is slow and silently capped at PostgREST's 1000-row limit). Filters + range run in the DB.
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [debouncedCity, setDebouncedCity] = useState('');

  // Proximity ("near ZIP/city within N miles") — geocode the entered origin once, then
  // rank/filter accounts by Haversine distance. Reuses /api/geocode + lib/geo, the same
  // machinery the claim auto-router uses.
  const [nearQuery, setNearQuery] = useState('');
  const [radius, setRadius] = useState<number>(50);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [nearError, setNearError] = useState('');

  const isReadOnly = role === 'demo';
  const selectable = !isReadOnly && role !== 'shop';

  const toast = useToast();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Shared server-side filter (search / state / city / status) so the paged load and
  // "select all matching" apply the exact same WHERE and never drift.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyAccountFilters = (q: any) => {
    const s = debouncedQuery.trim().replace(/[(),]/g, ' ').trim();
    let out = q;
    if (s) out = out.or(`account_name.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%`);
    if (stateFilter) out = out.ilike('state', stateFilter);
    if (debouncedCity.trim()) out = out.ilike('city', `%${debouncedCity.trim()}%`);
    if (statusFilter === 'active') out = out.neq('active', false);
    else if (statusFilter === 'disabled') out = out.eq('active', false);
    return out;
  };

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
    void resolveRole();
  }, []);

  useEffect(() => {
    setQuery(searchParams.get('search') || '');
    setStateFilter((searchParams.get('state') || '').trim().toUpperCase());
  }, [searchParams]);

  // Debounce the free-text inputs so each keystroke doesn't fire a query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCity(cityFilter), 300);
    return () => clearTimeout(t);
  }, [cityFilter]);

  // Any filter change returns to page 1.
  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, debouncedCity, stateFilter, statusFilter, origin, radius]);

  // Admin/demo: (re)load the current page from the server whenever filters or page change.
  useEffect(() => {
    if (role === 'admin' || role === 'demo') void loadAdminAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, debouncedQuery, debouncedCity, stateFilter, statusFilter, page, origin, radius]);

  async function resolveRole() {
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

    if (roleData.role === 'admin' || roleData.role === 'demo') {
      setRole(roleData.role); // the effect above loads the first page
      return;
    }

    // Shop: only ever their own account.
    setRole(roleData.role);
    const { data: shopData } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();
    if (!shopData?.account_id) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('accounts')
      .select(ADMIN_COLS)
      .eq('id', shopData.account_id);
    setAccounts((data as AccountRow[]) || []);
    setTotal((data || []).length);
    setLoading(false);
  }

  async function loadAdminAccounts() {
    setLoading(true);
    const q = applyAccountFilters(
      supabase.from('accounts').select(ADMIN_COLS, { count: 'exact' })
    );

    if (origin) {
      // Proximity ranks by Haversine client-side, so pull the geocoded matches (bounded) and
      // let the memo filter by radius + sort — no server paging in this mode.
      const { data } = await q
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1000);
      setAccounts((data as AccountRow[]) || []);
      setTotal((data || []).length);
    } else {
      const { data, count } = await q
        .order('account_name')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      setAccounts((data as AccountRow[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
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

  // offers_financing is a boolean, so it can't ride the string-valued updateAccount path —
  // map the Yes/No/Unknown cell to true/false/null (self-declared; a routing filter only).
  async function setAccountFinancing(id: string, value: string) {
    if (isReadOnly) return;

    const offers_financing = value === 'Yes' ? true : value === 'No' ? false : null;
    await supabase.from('accounts').update({ offers_financing }).eq('id', id);

    setAccounts((current) =>
      current.map((account) =>
        account.id === id ? { ...account, offers_financing } : account
      )
    );
  }

  // ---- bulk selection + actions ----

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const clearSelection = () => setSelected(new Set());

  // Pull EVERY id matching the current filter (across all pages), id-only in bounded pages.
  async function selectAllMatching() {
    setBulkBusy(true);
    try {
      const ids: string[] = [];
      const P = 1000;
      for (let from = 0; ; from += P) {
        const { data } = await applyAccountFilters(
          supabase.from('accounts').select('id')
        ).range(from, from + P - 1);
        const rows = (data as { id: string }[]) || [];
        ids.push(...rows.map((r) => r.id));
        if (rows.length < P) break;
      }
      setSelected(new Set(ids));
      toast.info(`Selected ${ids.length.toLocaleString()} matching account${ids.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Could not select all matching accounts.');
    } finally {
      setBulkBusy(false);
    }
  }

  // Apply a field update to every selected account, chunked so thousands of ids don't blow
  // the request. Optimistically patches the rows in view (field edits don't change the filter).
  async function bulkUpdate(patch: Partial<AccountRow>, label: string) {
    if (!selectable || selected.size === 0) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase
          .from('accounts')
          .update(patch)
          .in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
      setAccounts((cur) => cur.map((a) => (selected.has(a.id) ? { ...a, ...patch } : a)));
      toast.success(`${label} · ${ids.length.toLocaleString()} account${ids.length === 1 ? '' : 's'}`);
      clearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk update failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkSetActive(active: boolean) {
    if (!selectable || selected.size === 0) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase
          .from('accounts')
          .update({ active })
          .in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
      toast.success(
        `${active ? 'Enabled' : 'Disabled'} ${ids.length.toLocaleString()} account${ids.length === 1 ? '' : 's'}`
      );
      clearSelection();
      await loadAdminAccounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk status change failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!selectable || selected.size === 0) return;
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length.toLocaleString()} account${ids.length === 1 ? '' : 's'}?`,
      message:
        "This permanently removes them. Accounts linked to jobs or claims can't be deleted and are skipped.",
      destructive: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBulkBusy(true);
    let deleted = 0;
    let blocked = 0;
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase.from('accounts').delete().in('id', chunk);
        if (!error) {
          deleted += chunk.length;
          continue;
        }
        // A chunk fails if any row is FK-referenced — retry row-by-row to remove what we can.
        for (const id of chunk) {
          const { error: e2 } = await supabase.from('accounts').delete().eq('id', id);
          if (e2) blocked += 1;
          else deleted += 1;
        }
      }
      if (deleted) toast.success(`Deleted ${deleted.toLocaleString()} account${deleted === 1 ? '' : 's'}`);
      if (blocked) toast.error(`${blocked.toLocaleString()} couldn't be deleted (linked to jobs/claims)`);
      clearSelection();
      await loadAdminAccounts();
    } finally {
      setBulkBusy(false);
    }
  }

  // Search / state / city / status are applied server-side (see loadAdminAccounts). The memo
  // only adds proximity: when an origin is set, keep accounts within the radius, nearest first.
  const filteredAccounts = useMemo<AccountWithDistance[]>(() => {
    if (!origin) {
      return accounts.map((account) => ({ ...account, distance: null }));
    }
    return accounts
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
  }, [accounts, origin, radius]);

  const showDistance = origin != null;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      {loading ? (
        <Skeleton className="h-4 w-40" />
      ) : (
      <p className="text-sm text-slate-500">
        {showDistance
          ? `${filteredAccounts.length} shop${filteredAccounts.length === 1 ? '' : 's'} within ${radius} mi of "${nearQuery.trim()}" (mapped only)`
          : total > 0
            ? `${total.toLocaleString()} account${total === 1 ? '' : 's'} · showing ${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()}`
            : '0 accounts'}
      </p>
      )}

      {selectable && selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-semibold text-brand-800">
            {selected.size.toLocaleString()} selected
          </span>
          <button type="button" onClick={clearSelection} className="text-slate-500 underline">
            Clear
          </button>
          {!origin &&
          total > selected.size &&
          filteredAccounts.length > 0 &&
          filteredAccounts.every((a) => selected.has(a.id)) ? (
            <button
              type="button"
              onClick={selectAllMatching}
              disabled={bulkBusy}
              className="font-semibold text-brand-700 underline disabled:opacity-50"
            >
              Select all {total.toLocaleString()} matching
            </button>
          ) : null}
          <span className="mx-1 hidden h-5 w-px bg-brand-200 sm:block" />
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => bulkSetActive(true)}
            className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Enable
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => bulkSetActive(false)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Disable
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={bulkDelete}
            className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
          <span className="mx-1 hidden h-5 w-px bg-brand-200 sm:block" />
          <BulkSelect
            label="type"
            disabled={bulkBusy}
            options={[['shop', 'Shop'], ['independent_tech', 'Ind. tech']]}
            onPick={(v) => bulkUpdate({ provider_type: v }, 'Type set')}
          />
          <BulkSelect
            label="repair-only"
            disabled={bulkBusy}
            options={[['Yes', 'Yes'], ['No', 'No'], ['Unknown', 'Unknown']]}
            onPick={(v) => bulkUpdate({ repair_only: v }, 'Repair-only set')}
          />
          <BulkSelect
            label="outreach"
            disabled={bulkBusy}
            options={OUTREACH_OPTIONS.map((o) => [o, o] as [string, string])}
            onPick={(v) => bulkUpdate({ outreach_status: v }, 'Outreach set')}
          />
          <BulkSelect
            label="certified"
            disabled={bulkBusy}
            options={[['Yes', 'Yes'], ['No', 'No'], ['Unknown', 'Unknown']]}
            onPick={(v) => bulkUpdate({ glasweld_certified: v }, 'Certified set')}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1180px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {selectable ? (
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={
                      filteredAccounts.length > 0 &&
                      filteredAccounts.every((a) => selected.has(a.id))
                    }
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        const allSel =
                          filteredAccounts.length > 0 &&
                          filteredAccounts.every((a) => next.has(a.id));
                        filteredAccounts.forEach((a) =>
                          allSel ? next.delete(a.id) : next.add(a.id)
                        );
                        return next;
                      })
                    }
                    className="h-4 w-4 cursor-pointer"
                  />
                </th>
              ) : null}
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">State</th>
              {showDistance ? <th className="px-4 py-3">Distance</th> : null}
              <th className="px-4 py-3">Certified</th>
              <th className="px-4 py-3">Insurance</th>
              <th className="px-4 py-3">Onyx/Emerald</th>
              <th className="px-4 py-3">Zoom</th>
              <th className="px-4 py-3">Repair Only</th>
              <th className="px-4 py-3">Financing</th>
              <th className="px-4 py-3">Outreach</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <SkeletonRows columns={(showDistance ? 12 : 11) + (selectable ? 1 : 0)} rows={8} />
            ) : null}

            {!loading && filteredAccounts.map((account) => (
              <tr
                key={account.id}
                className={`border-t hover:bg-slate-50 ${
                  selected.has(account.id) ? 'bg-brand-50/60' : ''
                } ${account.active === false ? 'opacity-60' : ''}`}
              >
                {selectable ? (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${account.account_name || 'account'}`}
                      checked={selected.has(account.id)}
                      onChange={() => toggleRow(account.id)}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                ) : null}
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
                    value={
                      account.offers_financing === true
                        ? 'Yes'
                        : account.offers_financing === false
                          ? 'No'
                          : 'Unknown'
                    }
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) => setAccountFinancing(account.id, value)}
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

            {!loading && !filteredAccounts.length && (
              <tr>
                <td
                  colSpan={(showDistance ? 12 : 11) + (selectable ? 1 : 0)}
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

      {/* Pager — only in the server-paginated list (proximity mode returns all matches). */}
      {!loading && !showDistance && (role === 'admin' || role === 'demo') && total > PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page + 1} of {pageCount.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
            disabled={page + 1 >= pageCount}
            className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}

// A compact "Set <field>…" dropdown for the bulk toolbar: picking a value fires onPick and
// the control snaps back to the placeholder (it's a fire-once action, not a bound value).
function BulkSelect({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: [string, string][];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
    >
      <option value="">Set {label}…</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
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
    <Suspense fallback={<ListPageSkeleton withFilters columns={10} rows={8} minWidth={1180} />}>
      <AccountsPageContent />
    </Suspense>
  );
}
