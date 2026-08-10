'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/notifications';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';

type Account = {
  id: string;
  account_name: string | null;
  provider_type: string | null;
};

type RoleRow = {
  role: Role;
  approved: boolean;
  access_status: string | null;
  account_id: string | null;
  carrier_id: string | null;
};

type Job = {
  id: string;
  customer_name: string | null;
  job_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  invoice_date: string | null;
  created_at: string;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  intake_origin: string | null;
  service_type: string | null;
  payment_path: string | null;
  platform_fee_cents: number | null;
  marketing_source: string | null;
};

type Invoice = {
  id: string;
  job_id: string;
  invoice_amount: number | null;
  amount_paid: number | null;
  status: string | null;
  payment_status: string | null;
  submission_status: string | null;
};

type JobWithInvoice = Job & {
  invoice: Invoice | null;
};

type Role = 'admin' | 'shop' | 'carrier' | 'demo' | null;
type ViewMode =
  | 'open'
  | 'current'
  | 'submitted'
  | 'over30'
  | 'over60'
  | 'paid'
  | 'ongoing'
  | 'completed'
  | 'custom';

// Work-status buckets (job_status), distinct from the receivables views above.
const ONGOING_STATUSES = ['New', 'In Progress', 'Submitted'];

type SortKey =
  | 'date'
  | 'customer'
  | 'shop'
  | 'status'
  | 'service'
  | 'carrier'
  | 'invoice'
  | 'paid'
  | 'balance'
  | 'aging';
type SortDir = 'asc' | 'desc';
// Columns that sort alphabetically (default A→Z); everything else is numeric/date (high→low).
const TEXT_SORT_KEYS: SortKey[] = ['customer', 'shop', 'status', 'service', 'carrier'];

function jobStatusOf(j: { job_status: string | null }) {
  return j.job_status || 'New';
}

function money(v: number | null | undefined) {
  return Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfCurrentMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function invoiceAmount(j: JobWithInvoice) {
  return Number(j.invoice?.invoice_amount ?? j.invoice_amount ?? 0);
}

function paidAmount(j: JobWithInvoice) {
  return Number(j.invoice?.amount_paid ?? j.amount_paid ?? 0);
}

function outstandingAmount(j: JobWithInvoice) {
  return Math.max(invoiceAmount(j) - paidAmount(j), 0);
}

function jobDate(j: JobWithInvoice) {
  return (j.invoice_date || j.created_at || '').slice(0, 10);
}

function daysOutstanding(j: JobWithInvoice) {
  if (outstandingAmount(j) <= 0) return 0;
  const start = new Date(jobDate(j));
  return Math.floor((Date.now() - start.getTime()) / 86400000);
}

export default function JobsPage() {
  const router = useRouter();
  const toast = useToast();

  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [startDate, setStartDate] = useState(firstDayOfCurrentMonthIso());
  const [endDate, setEndDate] = useState(todayIso());

  // Admin dashboard filters + column sort. Providers/carriers narrow the all-jobs view;
  // shops are RLS-scoped to their own jobs so these stay admin-only.
  const [providerFilter, setProviderFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Text columns read best A→Z; money/date/aging default high→low (most recent / biggest).
      setSortDir(TEXT_SORT_KEYS.includes(key) ? 'asc' : 'desc');
    }
  }

  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newAmount, setNewAmount] = useState<number>(0);
  const [newInvoiceDate, setNewInvoiceDate] = useState(todayIso());
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newVehicleYear, setNewVehicleYear] = useState('');
  const [newVehicleMake, setNewVehicleMake] = useState('');
  const [newVehicleModel, setNewVehicleModel] = useState('');
  const [newInsuranceCarrier, setNewInsuranceCarrier] = useState('');
  const [newClaimNumber, setNewClaimNumber] = useState('');
  const [creating, setCreating] = useState(false);

  const isReadOnly = role === 'demo';
  // Only admins create/assign jobs; a shop just works the jobs routed to it.
  const canCreate = role === 'admin';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status, account_id, carrier_id')
      .eq('user_email', email)
      .maybeSingle<RoleRow>();

    setRole(roleData?.role || null);

    if (!roleData || !roleData.approved || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    if (roleData.role === 'carrier') {
      window.location.href = '/claims';
      return;
    }

    let jobQuery = supabase.from('jobs').select('*');

    if (roleData.role === 'shop') {
      if (!roleData.account_id) {
        setJobs([]);
        setAccounts([]);
        setLoading(false);
        return;
      }

      jobQuery = jobQuery.eq('assigned_account_id', roleData.account_id);
    }

    const { data: jobData } = await jobQuery.order('created_at', { ascending: false });

    if (roleData.role === 'admin') {
      // Only ACTIVE accounts are assignable / have jobs — scope to them so this doesn't pull
      // (and silently cap at 1000 of) the thousands of inactive candidate accounts.
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, account_name, provider_type')
        .eq('active', true)
        .order('account_name');

      setAccounts((accountData as Account[]) || []);
    } else if (roleData.role === 'shop' && roleData.account_id) {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, account_name, provider_type')
        .eq('id', roleData.account_id)
        .maybeSingle();

      setAccounts(accountData ? [accountData as Account] : []);
      setNewAccountId(roleData.account_id);
    }

    const jobIds = (jobData || []).map((j) => j.id);

    const { data: invoiceData } = jobIds.length
      ? await supabase
          .from('invoices')
          .select('*')
          .in('job_id', jobIds)
      : { data: [] };

    const map = new Map();
    (invoiceData || []).forEach((i) => map.set(i.job_id, i));

    setJobs((jobData || []).map((j) => ({ ...j, invoice: map.get(j.id) || null })));

    setLoading(false);
  }

  async function createJob() {
    if (isReadOnly) return;

    const selectedAccount = accounts.find((account) => account.id === newAccountId);

    if (!newCustomer.trim()) {
      toast.error('Customer name is required.');
      return;
    }

    if (!selectedAccount) {
      toast.error('Select an account before creating the job.');
      return;
    }

    setCreating(true);

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_name: newCustomer.trim(),
        intake_origin: role === 'shop' ? 'shop' : 'admin',
        service_type: 'repair',
        payment_path: newInsuranceCarrier.trim() ? 'insurance' : 'cash',
        assigned_account_id: selectedAccount.id,
        assigned_account_name: selectedAccount.account_name,
        job_status: 'New',
        invoice_amount: Number(newAmount || 0),
        amount_paid: 0,
        invoice_date: newInvoiceDate || todayIso(),
        customer_phone: newCustomerPhone.trim() || null,
        vehicle_year: newVehicleYear.trim() || null,
        vehicle_make: newVehicleMake.trim() || null,
        vehicle_model: newVehicleModel.trim() || null,
        insurance_carrier: newInsuranceCarrier.trim() || null,
        claim_number: newClaimNumber.trim() || null,
      })
      .select('id')
      .single();

    setCreating(false);

    if (error) {
      toast.error(`Could not create job: ${error.message}`);
      return;
    }

    setNewCustomer('');
    setNewAmount(0);
    setNewInvoiceDate(todayIso());
    setNewCustomerPhone('');
    setNewVehicleYear('');
    setNewVehicleMake('');
    setNewVehicleModel('');
    setNewInsuranceCarrier('');
    setNewClaimNumber('');
    setShowCreate(false);

    if (data?.id) {
      router.push(`/jobs/${data.id}`);
    }
  }

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      // Universal narrowing across every view: assigned provider + insurance carrier.
      if (providerFilter && j.assigned_account_id !== providerFilter) return false;
      if (carrierFilter && (j.insurance_carrier || '') !== carrierFilter) return false;

      const balance = outstandingAmount(j);
      const days = daysOutstanding(j);
      const status = jobStatusOf(j);

      // Work-status views: ongoing = assigned/active (not finished or canceled).
      if (viewMode === 'ongoing') return ONGOING_STATUSES.includes(status);
      if (viewMode === 'completed') return status === 'Completed';

      if (viewMode === 'open') return balance > 0;
      if (viewMode === 'submitted') return j.invoice?.submission_status === 'Submitted' && balance > 0;
      if (viewMode === 'over30') return balance > 0 && days >= 30;
      if (viewMode === 'over60') return balance > 0 && days >= 60;
      if (viewMode === 'paid') return balance <= 0;

      const d = jobDate(j);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;

      return true;
    });
  }, [jobs, viewMode, startDate, endDate, providerFilter, carrierFilter]);

  const sorted = useMemo(() => {
    const val = (j: JobWithInvoice): string | number => {
      switch (sortKey) {
        case 'customer': return (j.customer_name || '').toLowerCase();
        case 'shop': return (j.assigned_account_name || '').toLowerCase();
        case 'status': return jobStatusOf(j);
        case 'service': return j.service_type || '';
        case 'carrier': return (j.insurance_carrier || '').toLowerCase();
        case 'invoice': return invoiceAmount(j);
        case 'paid': return paidAmount(j);
        case 'balance': return outstandingAmount(j);
        case 'aging': return daysOutstanding(j);
        default: return jobDate(j);
      }
    };
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? c : -c;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (t, j) => {
        t.sales += invoiceAmount(j);
        t.paid += paidAmount(j);
        t.outstanding += outstandingAmount(j);
        return t;
      },
      { sales: 0, paid: 0, outstanding: 0 }
    );
  }, [filtered]);

  // Distinct insurance carriers present in the loaded jobs, for the admin filter dropdown.
  const carrierOptions = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      const c = (j.insurance_carrier || '').trim();
      if (c) set.add(c);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  // Per-provider rollup over the current filtered view — the "provider performance /
  // forecasting" panel. Sorted by sales so the biggest earners lead.
  const providerStats = useMemo(() => {
    const m = new Map<string, { name: string; jobs: number; sales: number; paid: number; outstanding: number }>();
    filtered.forEach((j) => {
      const key = j.assigned_account_id || 'unassigned';
      const row = m.get(key) || {
        name: j.assigned_account_name || 'Unassigned',
        jobs: 0,
        sales: 0,
        paid: 0,
        outstanding: 0,
      };
      row.jobs += 1;
      row.sales += invoiceAmount(j);
      row.paid += paidAmount(j);
      row.outstanding += outstandingAmount(j);
      m.set(key, row);
    });
    return [...m.values()].sort((a, b) => b.sales - a.sales);
  }, [filtered]);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Jobs Ledger</h1>
          <p className="text-sm text-slate-500">Receivables + job tracking</p>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-slate-800"
          >
            + Add Job
          </button>
        )}
      </div>

      {showCreate && canCreate ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Add Job</h2>
              <p className="mt-1 text-xs text-slate-500">
                Create the job here, then open it to add photos, invoice details, and payments.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              placeholder="Customer name"
              className="h-11"
            />

            <input
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
              placeholder="Customer phone"
              className="h-11"
            />

            <select
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              className="h-11"
            >
              <option value="">Select provider</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name || 'Unnamed Account'}
                  {account.provider_type === 'independent_tech' ? ' — Independent tech' : ''}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={newInvoiceDate}
              onChange={(e) => setNewInvoiceDate(e.target.value)}
              className="h-11"
            />

            <div className="grid grid-cols-3 gap-2">
              <input
                value={newVehicleYear}
                onChange={(e) => setNewVehicleYear(e.target.value)}
                placeholder="Year"
                className="h-11"
              />

              <input
                value={newVehicleMake}
                onChange={(e) => setNewVehicleMake(e.target.value)}
                placeholder="Make"
                className="h-11"
              />

              <input
                value={newVehicleModel}
                onChange={(e) => setNewVehicleModel(e.target.value)}
                placeholder="Model"
                className="h-11"
              />
            </div>

            <input
              value={newInsuranceCarrier}
              onChange={(e) => setNewInsuranceCarrier(e.target.value)}
              placeholder="Insurance carrier"
              className="h-11"
            />

            <input
              value={newClaimNumber}
              onChange={(e) => setNewClaimNumber(e.target.value)}
              placeholder="Claim number"
              className="h-11"
            />

            <input
              type="number"
              step="0.01"
              min="0"
              value={newAmount}
              onChange={(e) => setNewAmount(Number(e.target.value))}
              placeholder="Invoice amount"
              className="h-11"
            />

            <div className="flex gap-2 xl:justify-end">
              <button
                type="button"
                disabled={creating}
                onClick={() => void createJob()}
                className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* FILTER BAR (FIXED ALIGNMENT) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">

          {/* BUTTON GROUP */}
          <div className="flex flex-wrap gap-2">
            <Filter active={viewMode === 'ongoing'} onClick={() => setViewMode('ongoing')}>Ongoing</Filter>
            <Filter active={viewMode === 'completed'} onClick={() => setViewMode('completed')}>Completed</Filter>
            <Filter active={viewMode === 'open'} onClick={() => setViewMode('open')}>Open</Filter>
            <Filter active={viewMode === 'current'} onClick={() => setViewMode('current')}>Month</Filter>
            <Filter active={viewMode === 'submitted'} onClick={() => setViewMode('submitted')}>Submitted</Filter>
            <Filter active={viewMode === 'over30'} onClick={() => setViewMode('over30')}>30+</Filter>
            <Filter active={viewMode === 'over60'} onClick={() => setViewMode('over60')}>60+</Filter>
            <Filter active={viewMode === 'paid'} onClick={() => setViewMode('paid')}>Paid</Filter>
          </div>

          {/* ADMIN: provider + carrier filters (all jobs → narrow to one shop/carrier) */}
          {role === 'admin' ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="h-8 rounded border px-2 text-sm"
              >
                <option value="">All providers</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_name || 'Unnamed'}
                    {account.provider_type === 'independent_tech' ? ' — Ind. tech' : ''}
                  </option>
                ))}
              </select>

              <select
                value={carrierFilter}
                onChange={(e) => setCarrierFilter(e.target.value)}
                className="h-8 rounded border px-2 text-sm"
              >
                <option value="">All carriers</option>
                {carrierOptions.map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {carrier}
                  </option>
                ))}
              </select>

              {providerFilter || carrierFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setProviderFilter('');
                    setCarrierFilter('');
                  }}
                  className="rounded border px-2 py-1 text-xs text-slate-600"
                >
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}

          {/* DATE GROUP */}
          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setViewMode('custom');
              }}
              className="rounded border px-2 py-1 text-sm"
            />

            <span className="text-slate-400">—</span>

            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setViewMode('custom');
              }}
              className="rounded border px-2 py-1 text-sm"
            />

            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="rounded border px-3 py-1 text-sm"
            >
              Clear
            </button>
          </div>

        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Sales" value={money(totals.sales)} loading={loading} />
        <Stat label="Paid" value={money(totals.paid)} green loading={loading} />
        <Stat label="Outstanding" value={money(totals.outstanding)} red loading={loading} />
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-soft">
        <table className="min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <SortHeader label="Date" k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Customer" k="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {role === 'admin' ? (
                <SortHeader label="Provider" k="shop" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              ) : null}
              <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Origin</th>
              <SortHeader label="Service" k="service" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Carrier" k="carrier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Claim</th>
              <SortHeader label="Invoice" k="invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Paid" k="paid" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Balance" k="balance" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Aging" k="aging" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <SkeletonRows columns={role === 'admin' ? 12 : 11} rows={8} />
            ) : (
              sorted.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => router.push(`/jobs/${j.id}`)}
                  className="cursor-pointer border-t hover:bg-slate-50"
                >
                  <td className="px-4 py-3">{jobDate(j)}</td>
                  <td className="px-4 py-3">{j.customer_name}</td>
                  {role === 'admin' ? (
                    <td className="px-4 py-3">{j.assigned_account_name || '—'}</td>
                  ) : null}
                  <td className="px-4 py-3"><StatusBadge status={j.job_status} /></td>
                  <td className="px-4 py-3">
                    <div>{j.intake_origin || 'admin'}</div>
                    <div className="text-xs text-slate-500">{j.marketing_source || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{j.service_type || 'repair'}</div>
                    <div className="text-xs text-slate-500">{j.payment_path || 'unknown'}</div>
                  </td>
                  <td className="px-4 py-3">{j.insurance_carrier}</td>
                  <td className="px-4 py-3">{j.claim_number}</td>
                  <td className="px-4 py-3">{money(invoiceAmount(j))}</td>
                  <td className="px-4 py-3 text-emerald-700">{money(paidAmount(j))}</td>
                  <td className="px-4 py-3 text-rose-700">{money(outstandingAmount(j))}</td>
                  <td className="px-4 py-3">{daysOutstanding(j)}d</td>
                </tr>
              ))
            )}

            {!loading && !sorted.length ? (
              <tr>
                <td colSpan={role === 'admin' ? 12 : 11} className="py-10 text-center text-slate-500">
                  No jobs match this view.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* PROVIDER PERFORMANCE (admin) — per-provider rollup over the current view */}
      {role === 'admin' && !loading && providerStats.length ? (
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-soft">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-900">By provider</h2>
            <span className="text-xs text-slate-500">{providerStats.length} in view</span>
          </div>
          <table className="mt-2 min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-right">Jobs</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {providerStats.map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-right">{p.jobs}</td>
                  <td className="px-4 py-3 text-right">{money(p.sales)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{money(p.paid)}</td>
                  <td className="px-4 py-3 text-right text-rose-700">{money(p.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

    </div>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? 'text-slate-900' : 'hover:text-slate-700'}`}
      >
        {label}
        <span className="text-[10px] text-slate-400">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

const STATUS_STYLES: Record<string, string> = {
  New: 'bg-slate-100 text-slate-700 ring-slate-200',
  'In Progress': 'bg-blue-50 text-blue-700 ring-blue-200',
  Submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Canceled: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status || 'New';
  const cls = STATUS_STYLES[s] || STATUS_STYLES.New;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {s}
    </span>
  );
}

function Filter({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded bg-slate-950 px-3 py-1 text-sm text-white'
          : 'rounded border px-3 py-1 text-sm'
      }
    >
      {children}
    </button>
  );
}

function Stat({ label, value, green, red, loading }: any) {
  const color = green ? 'text-emerald-700' : red ? 'text-rose-700' : '';

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-soft">
      <div className="text-xs text-slate-500">{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-28" />
      ) : (
        <div className={`text-lg font-semibold ${color}`}>{value}</div>
      )}
    </div>
  );
}
