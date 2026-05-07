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
};

type Invoice = {
  id: string;
  job_id: string;
  invoice_amount: number | null;
  amount_paid: number | null;
};

type JobWithInvoice = Job & {
  invoice: Invoice | null;
};

type Role = 'admin' | 'shop' | 'carrier' | null;

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

export default function JobsPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [shopAccountId, setShopAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      .select('id, job_id, invoice_amount, amount_paid')
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

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const date = jobDate(job);

      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;

      return true;
    });
  }, [jobs, startDate, endDate]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {role === 'admin' ? 'All Jobs' : 'Your Jobs'}
          </h1>
          <p className="text-sm text-slate-500">
            {role === 'admin'
              ? 'Full system visibility'
              : 'Jobs assigned to your account'}
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
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Start
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setStartDate(firstDayOfCurrentMonthIso());
              setEndDate(todayIso());
            }}
            className="rounded bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Current Month
          </button>

          <button
            type="button"
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Jobs" value={totals.jobs.toString()} />
        <Stat label="Sales" value={money(totals.sales)} />
        <Stat label="Paid" value={money(totals.paid)} green />
        <Stat label="Outstanding" value={money(totals.outstanding)} red />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Outstanding</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                  className="cursor-pointer border-t hover:bg-slate-50"
                >
                  <td className="px-4 py-3">{jobDate(job)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {job.customer_name || '—'}
                  </td>
                  <td className="px-4 py-3">{job.job_status || '—'}</td>
                  <td className="px-4 py-3">{job.assigned_account_name || '—'}</td>
                  <td className="px-4 py-3">{money(invoiceAmount(job))}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">
                    {money(paidAmount(job))}
                  </td>
                  <td className="px-4 py-3 font-semibold text-rose-700">
                    {money(outstandingAmount(job))}
                  </td>
                </tr>
              ))
            )}

            {!loading && !filteredJobs.length ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  No jobs available for this date range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
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