'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(firstDayOfCurrentMonthIso());
  const [endDate, setEndDate] = useState(todayIso());

  useEffect(() => {
    void loadJobs();
  }, []);

  async function loadJobs() {
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

    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (roleData.role !== 'admin') {
      const { data: shopData } = await supabase
        .from('shop_users')
        .select('account_id')
        .eq('user_email', email)
        .maybeSingle();

      if (!shopData?.account_id) {
        setJobs([]);
        setLoading(false);
        return;
      }

      query = query.eq('assigned_account_id', shopData.account_id);
    }

    const { data: jobData } = await query;
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

    const invoices = (invoiceData as Invoice[]) || [];
    const invoiceByJobId = new Map<string, Invoice>();

    invoices.forEach((invoice) => {
      invoiceByJobId.set(invoice.job_id, invoice);
    });

    setJobs(
      baseJobs.map((job) => ({
        ...job,
        invoice: invoiceByJobId.get(job.id) || null,
      }))
    );

    setLoading(false);
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const jobDate = (job.invoice_date || job.created_at || '').slice(0, 10);

      if (startDate && jobDate < startDate) return false;
      if (endDate && jobDate > endDate) return false;

      return true;
    });
  }, [jobs, startDate, endDate]);

  const totals = useMemo(() => {
    return filteredJobs.reduce(
      (sum, job) => {
        sum.totalJobs += 1;
        sum.totalSales += invoiceAmount(job);
        sum.totalPaid += paidAmount(job);
        sum.totalOutstanding += outstandingAmount(job);
        return sum;
      },
      {
        totalJobs: 0,
        totalSales: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      }
    );
  }, [filteredJobs]);

  function setCurrentMonth() {
    setStartDate(firstDayOfCurrentMonthIso());
    setEndDate(todayIso());
  }

  function clearDates() {
    setStartDate('');
    setEndDate('');
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">
          {role === 'admin' ? 'All Jobs' : 'Your Jobs'}
        </h1>
        <p className="text-sm text-slate-500">
          {role === 'admin'
            ? 'Full system visibility'
            : 'You only see jobs assigned to your account'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Start
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="block h-10 rounded-lg border border-slate-300 px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            End
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="block h-10 rounded-lg border border-slate-300 px-3 text-sm"
          />
        </div>

        <button
          onClick={setCurrentMonth}
          className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Current Month
        </button>

        <button
          onClick={clearDates}
          className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Jobs" value={totals.totalJobs.toString()} />
        <Stat label="Sales" value={money(totals.totalSales)} />
        <Stat label="Paid" value={money(totals.totalPaid)} tone="green" />
        <Stat label="Outstanding" value={money(totals.totalOutstanding)} tone="red" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              {role === 'admin' && <th className="px-4 py-3">Shop</th>}
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Outstanding</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={role === 'admin' ? 8 : 7} className="py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr key={job.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {(job.invoice_date || job.created_at || '').slice(0, 10)}
                  </td>

                  <td className="px-4 py-3 font-medium text-slate-900">
                    {job.customer_name || '—'}
                  </td>

                  <td className="px-4 py-3">{job.job_status || '—'}</td>

                  {role === 'admin' && (
                    <td className="px-4 py-3">
                      {job.assigned_account_name || '—'}
                    </td>
                  )}

                  <td className="px-4 py-3 font-medium">
                    {money(invoiceAmount(job))}
                  </td>

                  <td className="px-4 py-3 font-medium text-emerald-700">
                    {money(paidAmount(job))}
                  </td>

                  <td className="px-4 py-3 font-medium text-rose-700">
                    {money(outstandingAmount(job))}
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}

            {!loading && !filteredJobs.length && (
              <tr>
                <td colSpan={role === 'admin' ? 8 : 7} className="py-10 text-center text-slate-500">
                  No jobs available for this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'red';
}) {
  const color =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'red'
        ? 'text-rose-700'
        : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}