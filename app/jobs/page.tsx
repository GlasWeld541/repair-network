'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_OPTIONS = ['Assigned', 'Scheduled', 'Completed', 'Cancelled'] as const;

/* --- TYPES UNCHANGED --- */
type JobRow = { /* unchanged */ } & any;
type InvoiceRow = { /* unchanged */ } & any;
type JobWithInvoice = JobRow & { invoice: InvoiceRow | null };
type ShopUser = { account_id: string; account_name: string | null };
type AccountRow = { id: string; account_name: string | null };

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function displayInvoiceAmount(job: JobWithInvoice) {
  return Number(job.invoice?.invoice_amount ?? job.invoice_amount ?? 0);
}

function displayAmountPaid(job: JobWithInvoice) {
  return Number(job.invoice?.amount_paid ?? job.amount_paid ?? 0);
}

function displayUnpaid(job: JobWithInvoice) {
  return Math.max(displayInvoiceAmount(job) - displayAmountPaid(job), 0);
}

function startOfCurrentMonthIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);

  const [dateFrom, setDateFrom] = useState(startOfCurrentMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState('All');

  const [showAddJob, setShowAddJob] = useState(false);

  useEffect(() => {
    void loadJobs();
  }, [dateFrom, dateTo]);

  async function loadJobs() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase();

    let shop: ShopUser | null = null;

    if (email) {
      const { data } = await supabase
        .from('shop_users')
        .select('account_id, account_name')
        .eq('user_email', email)
        .maybeSingle();

      shop = data as ShopUser | null;
    }

    setShopUser(shop);

    let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });

    if (shop?.account_id) {
      query = query.eq('assigned_account_id', shop.account_id);
    }

    if (dateFrom) query = query.gte('invoice_date', dateFrom);
    if (dateTo) query = query.lte('invoice_date', dateTo);

    const { data: jobData } = await query;
    const baseJobs = (jobData as JobRow[]) || [];

    if (!baseJobs.length) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .in('job_id', baseJobs.map((j) => j.id));

    const map = new Map();
    (invoices || []).forEach((inv: any) => map.set(inv.job_id, inv));

    setJobs(baseJobs.map((j) => ({ ...j, invoice: map.get(j.id) || null })));
    setLoading(false);
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter === 'All') return true;
      return (job.job_status || 'Assigned') === statusFilter;
    });
  }, [jobs, statusFilter]);

  const totals = useMemo(() => {
    return filteredJobs.reduce(
      (sum, job) => {
        const inv = displayInvoiceAmount(job);
        const paid = displayAmountPaid(job);

        sum.jobs++;
        sum.sales += inv;
        sum.paid += paid;
        sum.unpaid += Math.max(inv - paid, 0);

        return sum;
      },
      { jobs: 0, sales: 0, paid: 0, unpaid: 0 }
    );
  }, [filteredJobs]);

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">

      {/* HEADER */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            {shopUser?.account_name ? `${shopUser.account_name} Jobs` : 'Jobs'}
          </h1>
          <p className="text-sm text-slate-500">
            Track jobs, invoices, and payment collection.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input">
            <option value="All">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>

          <button onClick={() => {
            setDateFrom('');
            setDateTo('');
            setStatusFilter('All');
          }} className="btn-secondary">Clear</button>

          <button onClick={() => {
            setDateFrom(startOfCurrentMonthIso());
            setDateTo(todayIso());
          }} className="btn-primary">
            Current Month
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Total Jobs', totals.jobs],
          ['Total Sales', money(totals.sales)],
          ['Paid', money(totals.paid)],
          ['Unpaid', money(totals.unpaid)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {/* TABLE */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-soft">

        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="font-semibold">Job Activity</div>
            <div className="text-xs text-slate-500">
              Showing {filteredJobs.length} jobs
            </div>
          </div>

          <button
            onClick={() => setShowAddJob(true)}
            className="btn-primary"
          >
            + Add Job
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4 text-left">Customer</th>
              <th>Vehicle</th>
              <th>Status</th>
              <th className="text-right">Invoice</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Unpaid</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {filteredJobs.map((job) => (
              <tr key={job.id} className="border-t hover:bg-slate-50">
                <td className="p-4">{job.customer_name}</td>
                <td>{job.vehicle_make}</td>
                <td>{job.job_status}</td>
                <td className="text-right">{money(displayInvoiceAmount(job))}</td>
                <td className="text-right text-emerald-600">{money(displayAmountPaid(job))}</td>
                <td className="text-right text-red-600">{money(displayUnpaid(job))}</td>
                <td className="text-right pr-4">
                  <Link href={`/jobs/${job.id}`} className="btn-dark">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}