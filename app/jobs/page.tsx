'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  job_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  invoice_date: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfCurrentMonthIso() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(startOfCurrentMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  async function loadJobs() {
    setLoading(true);

    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFrom) {
      query = query.gte('invoice_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('invoice_date', dateTo);
    }

    const { data } = await query;

    setJobs((data as JobRow[]) || []);
    setLoading(false);
  }

  const totals = useMemo(() => {
    return jobs.reduce(
      (sum, job) => {
        const invoiceAmount = Number(job.invoice_amount || 0);
        const amountPaid = Number(job.amount_paid || 0);

        sum.jobCount += 1;
        sum.totalSales += invoiceAmount;
        sum.totalPaid += amountPaid;
        sum.totalUnpaid += invoiceAmount - amountPaid;

        return sum;
      },
      {
        jobCount: 0,
        totalSales: 0,
        totalPaid: 0,
        totalUnpaid: 0,
      }
    );
  }, [jobs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500">
            Track job volume, sales, payments, and unpaid balances.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              From
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              To
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => {
              setDateFrom(startOfCurrentMonthIso());
              setDateTo(todayIso());
            }}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            Current Month
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total Jobs
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {totals.jobCount}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total Sales
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {money(totals.totalSales)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Paid
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">
            {money(totals.totalPaid)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Unpaid
          </div>
          <div className="mt-2 text-3xl font-semibold text-rose-700">
            {money(totals.totalUnpaid)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Invoice Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Unpaid</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  Loading jobs...
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const invoiceAmount = Number(job.invoice_amount || 0);
                const amountPaid = Number(job.amount_paid || 0);
                const unpaid = invoiceAmount - amountPaid;

                return (
                  <tr
                    key={job.id}
                    className="cursor-pointer border-t hover:bg-slate-50"
                    onClick={() => {
                      window.location.href = `/jobs/${job.id}`;
                    }}
                  >
                    <td className="px-4 py-3">{job.invoice_date || '—'}</td>

                    <td className="px-4 py-3 font-medium text-slate-900">
                      {job.customer_name || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {[job.vehicle_year, job.vehicle_make, job.vehicle_model]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </td>

                    <td className="px-4 py-3">{job.job_status || '—'}</td>

                    <td className="px-4 py-3">{money(invoiceAmount)}</td>

                    <td className="px-4 py-3">{money(amountPaid)}</td>

                    <td className="px-4 py-3 font-medium text-rose-700">
                      {money(unpaid)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/jobs/${job.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}

            {!loading && !jobs.length ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  No jobs found for this date range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}