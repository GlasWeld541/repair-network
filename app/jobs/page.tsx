'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_OPTIONS = ['Assigned', 'Scheduled', 'Completed', 'Cancelled'] as const;

type JobRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  job_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  invoice_date: string | null;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  loss_date: string | null;
};

type InvoiceRow = {
  id: string;
  job_id: string;
  invoice_amount: number | null;
  amount_paid: number | null;
  status: string | null;
  payment_status: string | null;
  submission_status: string | null;
};

type JobWithInvoice = JobRow & {
  invoice: InvoiceRow | null;
};

type ShopUser = {
  account_id: string;
  account_name: string | null;
};

type AccountRow = {
  id: string;
  account_name: string | null;
};

type NewJobForm = {
  customer_name: string;
  invoice_amount: string;
  invoice_date: string;
  assigned_account_id: string;
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
  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);

  const [showAddJob, setShowAddJob] = useState(false);
  const [newJob, setNewJob] = useState<NewJobForm>({
    customer_name: '',
    invoice_amount: '',
    invoice_date: todayIso(),
    assigned_account_id: '',
  });

  const [dateFrom, setDateFrom] = useState(startOfCurrentMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    loadJobs();
  }, [dateFrom, dateTo]);

  async function loadJobs() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    let currentShopUser: ShopUser | null = null;

    if (email) {
      const { data } = await supabase
        .from('shop_users')
        .select('account_id, account_name')
        .eq('user_email', email)
        .maybeSingle();

      currentShopUser = data || null;
      setShopUser(currentShopUser);
    }

    let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });

    if (currentShopUser?.account_id) {
      query = query.eq('assigned_account_id', currentShopUser.account_id);
    }

    if (dateFrom) query = query.gte('invoice_date', dateFrom);
    if (dateTo) query = query.lte('invoice_date', dateTo);

    const { data } = await query;
    setJobs((data as JobWithInvoice[]) || []);
    setLoading(false);
  }

  async function updateJobStatus(jobId: string, newStatus: string) {
    const { error } = await supabase
      .from('jobs')
      .update({ job_status: newStatus })
      .eq('id', jobId);

    if (error) {
      alert('Failed to update status');
      return;
    }

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, job_status: newStatus } : j))
    );
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
        const inv = Number(job.invoice_amount || 0);
        const paid = Number(job.amount_paid || 0);

        sum.jobCount++;
        sum.totalSales += inv;
        sum.totalPaid += paid;
        sum.totalUnpaid += inv - paid;

        return sum;
      },
      { jobCount: 0, totalSales: 0, totalPaid: 0, totalUnpaid: 0 }
    );
  }, [filteredJobs]);

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border px-3 py-2 rounded"
        >
          <option value="All">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        Jobs: {totals.jobCount} | Sales: {money(totals.totalSales)} | Paid:{' '}
        {money(totals.totalPaid)} | Unpaid: {money(totals.totalUnpaid)}
      </div>

      <table className="w-full text-sm">
        <tbody>
          {loading ? (
            <tr>
              <td>Loading...</td>
            </tr>
          ) : (
            filteredJobs.map((job) => (
              <tr
                key={job.id}
                onClick={() => (window.location.href = `/jobs/${job.id}`)}
                className="border-t cursor-pointer"
              >
                <td>{job.customer_name}</td>

                <td>
                  <select
                    value={job.job_status || 'Assigned'}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateJobStatus(job.id, e.target.value);
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>

                <td>{money(job.invoice_amount)}</td>
                <td>{money(job.amount_paid)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}