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
  payment_method: string | null;
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

type LedgerRow = Job & {
  invoice_id: string | null;
  invoice_payment_status: string | null;
  invoice_submission_status: string | null;
  ledger_invoice: number;
  ledger_paid: number;
};

type LedgerSummary = {
  count: number;
  sales: number;
  paid: number;
  outstanding: number;
  providers: { name: string; jobs: number; sales: number; paid: number; outstanding: number }[];
  carriers: string[];
};

const EMPTY_SUMMARY: LedgerSummary = { count: 0, sales: 0, paid: 0, outstanding: 0, providers: [], carriers: [] };
const LEDGER_PAGE = 50;

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
// REX-12: 'Accepted' and 'Not Repairable' are both still live work — a returned-as-
// not-repairable job needs the admin to re-route it, so it must not drop out of view.
const ONGOING_STATUSES = ['New', 'Accepted', 'In Progress', 'Submitted', 'Not Repairable'];

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

  // One page of the ledger, filtered, sorted and totalled in the database (network.jobs_ledger +
  // jobs_ledger_summary): jobs grow with every claim, so the browser never loads them all.
  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [shopAccountId, setShopAccountId] = useState<string | null>(null);
  const [summary, setSummary] = useState<LedgerSummary>(EMPTY_SUMMARY);
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

    if (roleData.role === 'shop') {
      if (!roleData.account_id) {
        setJobs([]);
        setAccounts([]);
        setLoading(false);
        return;
      }
      setShopAccountId(roleData.account_id);
    }

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

    setLoading(false);
  }

  // A filter or sort change starts again from the first page.
  useEffect(() => {
    setLedgerPage(0);
  }, [viewMode, startDate, endDate, providerFilter, carrierFilter, sortKey, sortDir]);

  // Wait for the sign-in check in load() to finish: running both at once makes the auth client's
  // session lock collide, and the page never left its loading state.
  useEffect(() => {
    if (loading) return;
    if (role === 'admin' || role === 'demo' || (role === 'shop' && shopAccountId)) void loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, role, shopAccountId, viewMode, startDate, endDate, providerFilter, carrierFilter, sortKey, sortDir, ledgerPage]);

  async function loadLedger() {
    setLedgerLoading(true);
    try {
      await fetchLedger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load jobs.');
    } finally {
      setLedgerLoading(false);
    }
  }

  async function fetchLedger() {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    let q = supabase.from('jobs_ledger').select('*', { count: 'exact' });
    if (shopAccountId) q = q.eq('assigned_account_id', shopAccountId);
    if (providerFilter) q = q.eq('assigned_account_id', providerFilter);
    if (carrierFilter) q = q.eq('insurance_carrier', carrierFilter);
    if (viewMode === 'ongoing') q = q.or(`job_status.is.null,job_status.in.(${ONGOING_STATUSES.map((v) => `"${v}"`).join(',')})`);
    else if (viewMode === 'completed') q = q.eq('job_status', 'Completed');
    else if (viewMode === 'open') q = q.gt('ledger_balance', 0);
    else if (viewMode === 'submitted') q = q.eq('invoice_submission_status', 'Submitted').gt('ledger_balance', 0);
    else if (viewMode === 'over30') q = q.gt('ledger_balance', 0).lte('ledger_date', daysAgo(30));
    else if (viewMode === 'over60') q = q.gt('ledger_balance', 0).lte('ledger_date', daysAgo(60));
    else if (viewMode === 'paid') q = q.lte('ledger_balance', 0);
    else {
      if (startDate) q = q.gte('ledger_date', startDate);
      if (endDate) q = q.lte('ledger_date', endDate);
    }
    const column: Record<SortKey, string> = {
      date: 'ledger_date', customer: 'customer_name', shop: 'assigned_account_name', status: 'job_status',
      service: 'service_type', carrier: 'insurance_carrier', invoice: 'ledger_invoice', paid: 'ledger_paid',
      balance: 'ledger_balance', aging: 'ledger_date',
    };
    // Aging is days since the job date, so "most days" is the oldest date first.
    const ascending = sortKey === 'aging' ? sortDir === 'desc' : sortDir === 'asc';
    const from = ledgerPage * LEDGER_PAGE;
    const [{ data, count }, { data: sum }] = await Promise.all([
      q.order(column[sortKey], { ascending, nullsFirst: false }).order('created_at', { ascending: false }).range(from, from + LEDGER_PAGE - 1),
      supabase.rpc('jobs_ledger_summary', {
        p_view: viewMode,
        p_start: startDate || null,
        p_end: endDate || null,
        p_provider: providerFilter || null,
        p_carrier: carrierFilter || null,
        p_account: shopAccountId,
      }),
    ]);
    setJobs(
      ((data as LedgerRow[]) || []).map((r) => ({
        ...r,
        invoice: r.invoice_id
          ? {
              id: r.invoice_id,
              job_id: r.id,
              invoice_amount: r.ledger_invoice,
              amount_paid: r.ledger_paid,
              status: null,
              payment_status: r.invoice_payment_status,
              submission_status: r.invoice_submission_status,
            }
          : null,
      }))
    );
    setLedgerTotal(count ?? 0);
    setSummary((sum as LedgerSummary) || EMPTY_SUMMARY);
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

  const sorted = jobs;
  const totals = summary;
  const carrierOptions = summary.carriers;
  const providerStats = summary.providers;
  const ledgerPages = Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE));

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
                className="rounded border px-2 py-1.5 text-sm leading-normal"
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
                className="rounded border px-2 py-1.5 text-sm leading-normal"
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

      {ledgerTotal > LEDGER_PAGE ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {(ledgerPage * LEDGER_PAGE + 1).toLocaleString()}–{Math.min((ledgerPage + 1) * LEDGER_PAGE, ledgerTotal).toLocaleString()} of{' '}
            {ledgerTotal.toLocaleString()} jobs{ledgerLoading ? ' · Updating…' : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ledgerPage === 0 || ledgerLoading}
              onClick={() => setLedgerPage((n) => n - 1)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={ledgerPage >= ledgerPages - 1 || ledgerLoading}
              onClick={() => setLedgerPage((n) => n + 1)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

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
  Accepted: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'In Progress': 'bg-blue-50 text-blue-700 ring-blue-200',
  'Not Repairable': 'bg-orange-50 text-orange-700 ring-orange-200',
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
