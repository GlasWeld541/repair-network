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

type Role = 'admin' | 'shop' | 'carrier' | null;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

    if (roleData.role === 'admin') {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      setJobs(data || []);
      setLoading(false);
      return;
    }

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

    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('assigned_account_id', shopData.account_id)
      .order('created_at', { ascending: false });

    setJobs(data || []);
    setLoading(false);
  }

  function money(value: number | null) {
    return Number(value || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (!startDate && !endDate) return true;

      const jobDate = job.invoice_date || job.created_at;
      if (!jobDate) return true;

      if (startDate && jobDate < startDate) return false;
      if (endDate && jobDate > endDate) return false;

      return true;
    });
  }, [jobs, startDate, endDate]);

  const totals = useMemo(() => {
    let totalSales = 0;
    let totalPaid = 0;

    for (const job of filteredJobs) {
      totalSales += Number(job.invoice_amount || 0);
      totalPaid += Number(job.amount_paid || 0);
    }

    return {
      totalSales,
      totalPaid,
      totalOutstanding: totalSales - totalPaid,
      totalJobs: filteredJobs.length,
    };
  }, [filteredJobs]);

  function setCurrentMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setStartDate(first.toISOString().slice(0, 10));
    setEndDate(last.toISOString().slice(0, 10));
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

      {/* FILTERS */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-slate-500">Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="block border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">End</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="block border rounded px-2 py-1"
          />
        </div>

        <button
          onClick={setCurrentMonth}
          className="px-3 py-2 bg-slate-900 text-white rounded"
        >
          Current Month
        </button>

        <button
          onClick={clearDates}
          className="px-3 py-2 border rounded"
        >
          Clear
        </button>
      </div>

      {/* TOTALS */}
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Jobs" value={totals.totalJobs.toString()} />
        <Stat label="Sales" value={money(totals.totalSales)} />
        <Stat label="Paid" value={money(totals.totalPaid)} />
        <Stat label="Outstanding" value={money(totals.totalOutstanding)} />
      </div>

      {/* TABLE */}
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
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  Loading...
                </td>
              </tr>
            ) : filteredJobs.map((job) => (
              <tr
                key={job.id}
                className="border-t hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  {(job.invoice_date || job.created_at || '').slice(0, 10)}
                </td>
                <td className="px-4 py-3">{job.customer_name || '—'}</td>
                <td className="px-4 py-3">{job.job_status || '—'}</td>

                {role === 'admin' && (
                  <td className="px-4 py-3">
                    {job.assigned_account_name || '—'}
                  </td>
                )}

                <td className="px-4 py-3">{money(job.invoice_amount)}</td>
                <td className="px-4 py-3">{money(job.amount_paid)}</td>

                <td className="px-4 py-3">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="bg-slate-900 text-white px-3 py-1 rounded"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}

            {!loading && !filteredJobs.length && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  No jobs available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500 uppercase">{label}</div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}