'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Account = {
  id: string;
  account_name: string | null;
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
};

type Invoice = {
  id: string;
  job_id: string;
  invoice_amount: number | null;
  amount_paid: number | null;
  status: string | null;
  payment_status: string | null;
  submission_status: string | null;
  created_at: string | null;
};

type JobWithInvoice = Job & {
  invoice: Invoice | null;
};

type Role = 'admin' | 'shop' | 'carrier' | null;
type ViewMode = 'open' | 'current' | 'submitted' | 'over30' | 'over60' | 'paid' | 'custom';

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfCurrentMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function invoiceAmount(job: JobWithInvoice) {
  return Number(job.invoice?.invoice_amount ?? job.invoice_amount ?? 0);
}

function paidAmount(job: JobWithInvoice) {
  return Number(job.invoice?.amount_paid ?? job.amount_paid ?? 0);
}

function outstandingAmount(job: JobWithInvoice) {
  return Math.max(invoiceAmount(job) - paidAmount(job), 0);
}

function jobDate(job: JobWithInvoice) {
  return (job.invoice_date || job.created_at || '').slice(0, 10);
}

function daysOutstanding(job: JobWithInvoice) {
  if (outstandingAmount(job) <= 0) return 0;

  const dateValue = jobDate(job);
  if (!dateValue) return 0;

  const start = new Date(`${dateValue}T00:00:00`);
  const now = new Date();

  return Math.max(
    Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    0
  );
}

function agingClass(days: number, balance: number) {
  if (balance <= 0) return 'text-slate-500';
  if (days >= 60) return 'text-rose-700 font-semibold';
  if (days >= 30) return 'text-amber-700 font-semibold';
  return 'text-slate-700 font-medium';
}

function badgeClass(value: string | null | undefined) {
  if (!value) return 'border-slate-200 bg-slate-50 text-slate-600';

  if (value === 'Paid' || value === 'Completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (value === 'Submitted' || value === 'Sent' || value === 'In Progress') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }

  if (value === 'Partial Payment') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (value === 'Canceled') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function JobsPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [shopAccountId, setShopAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('open');
  const [startDate, setStartDate] = useState(firstDayOfCurrentMonthIso());
  const [endDate, setEndDate] = useState(todayIso());

  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newInvoiceAmount, setNewInvoiceAmount] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

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

    setRole(roleData.role);

    let accountIdForShop: string | null = null;

    if (roleData.role === 'admin') {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, account_name')
        .order('account_name');

      setAccounts((accountData as Account[]) || []);
    } else {
      const { data: shopData } = await supabase
        .from('shop_users')
        .select('account_id')
        .eq('user_email', email)
        .maybeSingle();

      accountIdForShop = shopData?.account_id || null;
      setShopAccountId(accountIdForShop);
      setNewAccountId(accountIdForShop || '');

      if (accountIdForShop) {
        const { data: accountData } = await supabase
          .from('accounts')
          .select('id, account_name')
          .eq('id', accountIdForShop)
          .maybeSingle();

        if (accountData) {
          setAccounts([accountData as Account]);
        }
      }
    }

    let jobQuery = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (roleData.role !== 'admin') {
      if (!accountIdForShop) {
        setJobs([]);
        setLoading(false);
        return;
      }

      jobQuery = jobQuery.eq('assigned_account_id', accountIdForShop);
    }

    const { data: jobData } = await jobQuery;
    const baseJobs = (jobData as Job[]) || [];

    if (!baseJobs.length) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const jobIds = baseJobs.map((job) => job.id);

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select(
        'id, job_id, invoice_amount, amount_paid, status, payment_status, submission_status, created_at'
      )
      .in('job_id', jobIds);

    const invoiceMap = new Map<string, Invoice>();

    ((invoiceData as Invoice[]) || []).forEach((invoice) => {
      invoiceMap.set(invoice.job_id, invoice);
    });

    setJobs(
      baseJobs.map((job) => ({
        ...job,
        invoice: invoiceMap.get(job.id) || null,
      }))
    );

    setLoading(false);
  }

  async function createJob() {
    if (!newCustomer.trim()) {
      alert('Customer name is required.');
      return;
    }

    const finalAccountId = role === 'admin' ? newAccountId : shopAccountId;

    if (!finalAccountId) {
      alert('Select an account.');
      return;
    }

    const selectedAccount = accounts.find((account) => account.id === finalAccountId);

    setCreating(true);

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_name: newCustomer.trim(),
        assigned_account_id: finalAccountId,
        assigned_account_name: selectedAccount?.account_name || null,
        job_status: 'New',
        invoice_amount: Number(newInvoiceAmount || 0),
        amount_paid: 0,
        invoice_date: todayIso(),
      })
      .select('id')
      .single();

    setCreating(false);

    if (error) {
      alert(`Could not create job: ${error.message}`);
      return;
    }

    setShowCreate(false);
    setNewCustomer('');
    setNewInvoiceAmount(0);

    if (role === 'admin') {
      setNewAccountId('');
    }

    if (data?.id) {
      router.push(`/jobs/${data.id}`);
    }
  }

  function setCurrentMonthView() {
    setViewMode('current');
    setStartDate(firstDayOfCurrentMonthIso());
    setEndDate(todayIso());
  }

  function setCustomDateStart(value: string) {
    setStartDate(value);
    setViewMode('custom');
  }

  function setCustomDateEnd(value: string) {
    setEndDate(value);
    setViewMode('custom');
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const balance = outstandingAmount(job);
      const days = daysOutstanding(job);
      const submissionStatus = job.invoice?.submission_status || '';
      const paymentStatus = job.invoice?.payment_status || '';
      const status = job.job_status || '';

      if (viewMode === 'open') {
        return balance > 0;
      }

      if (viewMode === 'submitted') {
        return submissionStatus === 'Submitted' && balance > 0;
      }

      if (viewMode === 'over30') {
        return balance > 0 && days >= 30;
      }

      if (viewMode === 'over60') {
        return balance > 0 && days >= 60;
      }

      if (viewMode === 'paid') {
        return balance <= 0 || paymentStatus === 'Paid' || status === 'Completed';
      }

      const date = jobDate(job);

      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;

      return true;
    });
  }, [jobs, viewMode, startDate, endDate]);

  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      if (viewMode === 'open' || viewMode === 'submitted' || viewMode === 'over30' || viewMode === 'over60') {
        return daysOutstanding(b) - daysOutstanding(a);
      }

      return jobDate(b).localeCompare(jobDate(a));
    });
  }, [filteredJobs, viewMode]);

  const totals = useMemo(() => {
    return filteredJobs.reduce(
      (sum, job) => {
        sum.jobs += 1;
        sum.sales += invoiceAmount(job);
        sum.paid += paidAmount(job);
        sum.outstanding += outstandingAmount(job);
        return sum;
      },
      { jobs: 0, sales: 0, paid: 0, outstanding: 0 }
    );
  }, [filteredJobs]);

  const openTotal = useMemo(() => {
    return jobs.reduce(
      (sum, job) => {
        const balance = outstandingAmount(job);
        if (balance > 0) {
          sum.count += 1;
          sum.amount += balance;
        }
        return sum;
      },
      { count: 0, amount: 0 }
    );
  }, [jobs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {role === 'admin' ? 'Jobs Ledger' : 'Your Jobs Ledger'}
          </h1>
          <p className="text-sm text-slate-500">
            Track jobs, insurance submissions, payments, aging, and open balances.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="rounded bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          + Add Job
        </button>
      </div>

      {showCreate ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              placeholder="Customer name"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />

            {role === 'admin' ? (
              <select
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_name || 'Unnamed Account'}
                  </option>
                ))}
              </select>
            ) : null}

            <input
              type="number"
              step="0.01"
              value={newInvoiceAmount}
              onChange={(e) => setNewInvoiceAmount(Number(e.target.value))}
              placeholder="Invoice amount"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={creating}
              onClick={() => void createJob()}
              className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>

            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <FilterButton active={viewMode === 'open'} onClick={() => setViewMode('open')}>
            Open Ledger
          </FilterButton>

          <FilterButton active={viewMode === 'current'} onClick={setCurrentMonthView}>
            Current Month
          </FilterButton>

          <FilterButton active={viewMode === 'submitted'} onClick={() => setViewMode('submitted')}>
            Submitted, Not Paid
          </FilterButton>

          <FilterButton active={viewMode === 'over30'} onClick={() => setViewMode('over30')}>
            Over 30
          </FilterButton>

          <FilterButton active={viewMode === 'over60'} onClick={() => setViewMode('over60')}>
            Over 60
          </FilterButton>

          <FilterButton active={viewMode === 'paid'} onClick={() => setViewMode('paid')}>
            Paid / Closed
          </FilterButton>

          <div className="ml-0 flex flex-wrap items-end gap-3 lg:ml-auto">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Start
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setCustomDateStart(e.target.value)}
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                End
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setCustomDateEnd(e.target.value)}
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setViewMode('custom');
              }}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Clear Dates
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Stat label="Jobs" value={totals.jobs.toString()} />
        <Stat label="Sales" value={money(totals.sales)} />
        <Stat label="Paid" value={money(totals.paid)} green />
        <Stat label="Outstanding" value={money(totals.outstanding)} red />
        <Stat
          label="Total Open A/R"
          value={`${openTotal.count} / ${money(openTotal.amount)}`}
          red
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1320px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Job Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Claim #</th>
              <th className="px-4 py-3">Job Status</th>
              <th className="px-4 py-3">Submission</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Aging</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : (
              sortedJobs.map((job) => {
                const balance = outstandingAmount(job);
                const aging = daysOutstanding(job);

                return (
                  <tr
                    key={job.id}
                    onClick={() => router.push(`/jobs/${job.id}`)}
                    className="cursor-pointer border-t hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">{jobDate(job)}</td>

                    <td className="px-4 py-3 font-medium text-slate-900">
                      {job.customer_name || '—'}
                    </td>

                    <td className="px-4 py-3">{job.assigned_account_name || '—'}</td>
                    <td className="px-4 py-3">{job.insurance_carrier || '—'}</td>
                    <td className="px-4 py-3">{job.claim_number || '—'}</td>

                    <td className="px-4 py-3">
                      <Badge value={job.job_status || 'New'} />
                    </td>

                    <td className="px-4 py-3">
                      <Badge value={job.invoice?.submission_status || 'Not Submitted'} />
                    </td>

                    <td className="px-4 py-3">
                      <Badge value={job.invoice?.payment_status || 'Not Paid'} />
                    </td>

                    <td className="px-4 py-3 font-medium">
                      {money(invoiceAmount(job))}
                    </td>

                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      {money(paidAmount(job))}
                    </td>

                    <td className="px-4 py-3 font-semibold text-rose-700">
                      {money(balance)}
                    </td>

                    <td className={`px-4 py-3 ${agingClass(aging, balance)}`}>
                      {balance > 0 ? `${aging} days` : 'Closed'}
                    </td>
                  </tr>
                );
              })
            )}

            {!loading && !sortedJobs.length ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-slate-500">
                  No jobs match this ledger view.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800'
          : 'rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
      }
    >
      {children}
    </button>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(
        value
      )}`}
    >
      {value}
    </span>
  );
}

function Stat({
  label,
  value,
  green,
  red,
}: {
  label: string;
  value: string;
  green?: boolean;
  red?: boolean;
}) {
  const color = green
    ? 'text-emerald-700'
    : red
      ? 'text-rose-700'
      : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}