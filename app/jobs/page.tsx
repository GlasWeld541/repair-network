'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_OPTIONS = ['Assigned', 'Scheduled', 'Completed', 'Cancelled'] as const;
const STATUS_FILTERS = ['All', ...STATUS_OPTIONS] as const;

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
  customer_phone: string;
  customer_email: string;
  vehicle_year: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_vin: string;
  damage_type: string;
  damage_notes: string;
  invoice_amount: string;
  invoice_date: string;
  assigned_account_id: string;
  insurance_carrier: string;
  claim_number: string;
  policy_number: string;
  loss_date: string;
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

function displayInvoiceAmount(job: JobWithInvoice) {
  return Number(job.invoice?.invoice_amount ?? job.invoice_amount ?? 0);
}

function displayAmountPaid(job: JobWithInvoice) {
  return Number(job.invoice?.amount_paid ?? job.amount_paid ?? 0);
}

function displayUnpaid(job: JobWithInvoice) {
  return Math.max(displayInvoiceAmount(job) - displayAmountPaid(job), 0);
}

function emptyJobForm(): NewJobForm {
  return {
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    vehicle_year: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_vin: '',
    damage_type: '',
    damage_notes: '',
    invoice_amount: '',
    invoice_date: todayIso(),
    assigned_account_id: '',
    insurance_carrier: '',
    claim_number: '',
    policy_number: '',
    loss_date: '',
  };
}

function statusClass(status: string | null) {
  switch (status || 'Assigned') {
    case 'Scheduled':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'Completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'Cancelled':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);

  const [showAddJob, setShowAddJob] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [newJob, setNewJob] = useState<NewJobForm>(emptyJobForm());

  const [dateFrom, setDateFrom] = useState(startOfCurrentMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    void loadJobs();
  }, [dateFrom, dateTo]);

  async function getShopUserForCurrentLogin() {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    if (!email) return null;

    const { data } = await supabase
      .from('shop_users')
      .select('account_id, account_name')
      .eq('user_email', email)
      .maybeSingle();

    return (data as ShopUser | null) || null;
  }

  async function loadJobs() {
    setLoading(true);

    const currentShopUser = await getShopUserForCurrentLogin();
    setShopUser(currentShopUser);

    if (!currentShopUser?.account_id) {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, account_name')
        .order('account_name');

      setAccounts((accountData as AccountRow[]) || []);
    } else {
      setAccounts([
        {
          id: currentShopUser.account_id,
          account_name: currentShopUser.account_name,
        },
      ]);
    }

    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentShopUser?.account_id) {
      query = query.eq('assigned_account_id', currentShopUser.account_id);
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

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('id, job_id, invoice_amount, amount_paid, status, payment_status, submission_status')
      .in(
        'job_id',
        baseJobs.map((job) => job.id)
      );

    const invoiceByJobId = new Map<string, InvoiceRow>();

    ((invoiceData as InvoiceRow[]) || []).forEach((invoice) => {
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

  function openAddJob() {
    const nextForm = emptyJobForm();

    if (shopUser?.account_id) {
      nextForm.assigned_account_id = shopUser.account_id;
    }

    setNewJob(nextForm);
    setShowAddJob(true);
  }

  async function createJob() {
    if (!newJob.customer_name.trim()) {
      window.alert('Customer name is required.');
      return;
    }

    const assignedAccountId = shopUser?.account_id || newJob.assigned_account_id;

    if (!assignedAccountId) {
      window.alert('Assigned shop is required.');
      return;
    }

    const assignedAccount =
      accounts.find((account) => account.id === assignedAccountId) || null;

    const invoiceAmount = Number(newJob.invoice_amount || 0);

    setSavingJob(true);

    try {
      const { error } = await supabase.from('jobs').insert({
        customer_name: newJob.customer_name.trim(),
        customer_phone: newJob.customer_phone.trim() || null,
        customer_email: newJob.customer_email.trim() || null,
        vehicle_year: newJob.vehicle_year.trim() || null,
        vehicle_make: newJob.vehicle_make.trim() || null,
        vehicle_model: newJob.vehicle_model.trim() || null,
        vehicle_vin: newJob.vehicle_vin.trim() || null,
        damage_type: newJob.damage_type.trim() || null,
        damage_notes: newJob.damage_notes.trim() || null,
        job_status: 'Assigned',
        invoice_amount: Number.isFinite(invoiceAmount) ? invoiceAmount : 0,
        amount_paid: 0,
        payment_status: 'Not Paid',
        invoice_date: newJob.invoice_date || todayIso(),
        assigned_account_id: assignedAccountId,
        assigned_account_name:
          shopUser?.account_name || assignedAccount?.account_name || null,
        insurance_carrier: newJob.insurance_carrier.trim() || null,
        claim_number: newJob.claim_number.trim() || null,
        policy_number: newJob.policy_number.trim() || null,
        loss_date: newJob.loss_date || null,
      });

      if (error) {
        window.alert(`Could not add job: ${error.message}`);
        return;
      }

      setShowAddJob(false);
      setNewJob(emptyJobForm());
      await loadJobs();
    } finally {
      setSavingJob(false);
    }
  }

  async function updateJobStatus(jobId: string, newStatus: string) {
    const { error } = await supabase
      .from('jobs')
      .update({ job_status: newStatus })
      .eq('id', jobId);

    if (error) {
      window.alert(`Could not update job status: ${error.message}`);
      return;
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, job_status: newStatus } : job
      )
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
        const invoiceAmount = displayInvoiceAmount(job);
        const amountPaid = displayAmountPaid(job);

        sum.jobCount += 1;
        sum.totalSales += invoiceAmount;
        sum.totalPaid += amountPaid;
        sum.totalUnpaid += Math.max(invoiceAmount - amountPaid, 0);

        return sum;
      },
      {
        jobCount: 0,
        totalSales: 0,
        totalPaid: 0,
        totalUnpaid: 0,
      }
    );
  }, [filteredJobs]);

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {shopUser?.account_name ? `${shopUser.account_name} Jobs` : 'Jobs'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {shopUser
              ? 'This view only shows jobs assigned to your business.'
              : 'Track jobs, invoices, insurance submission, and future payment collection.'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              From
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm"
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
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setDateFrom(startOfCurrentMonthIso());
              setDateTo(todayIso());
            }}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Current Month
          </button>

          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setStatusFilter('All');
            }}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => {
            const active = statusFilter === status;

            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total Jobs
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {totals.jobCount}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total Sales
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {money(totals.totalSales)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Paid
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">
            {money(totals.totalPaid)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Unpaid
          </div>
          <div className="mt-2 text-3xl font-semibold text-rose-700">
            {money(totals.totalUnpaid)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Job Activity</div>
            <div className="mt-1 text-xs text-slate-500">
              Showing {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'} for the selected filters.
            </div>
          </div>

          <button
            type="button"
            onClick={openAddJob}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            + Add Job
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Invoice Date</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Vehicle</th>
                {!shopUser ? <th className="px-5 py-3 font-semibold">Assigned Shop</th> : null}
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Invoice</th>
                <th className="px-5 py-3 text-right font-semibold">Paid</th>
                <th className="px-5 py-3 text-right font-semibold">Unpaid</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={shopUser ? 8 : 9} className="py-12 text-center text-slate-500">
                    Loading jobs...
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const invoiceAmount = displayInvoiceAmount(job);
                  const amountPaid = displayAmountPaid(job);
                  const unpaid = displayUnpaid(job);

                  return (
                    <tr
                      key={job.id}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                      onClick={() => {
                        window.location.href = `/jobs/${job.id}`;
                      }}
                    >
                      <td className="px-5 py-4 text-slate-700">{job.invoice_date || '—'}</td>

                      <td className="px-5 py-4 font-medium text-slate-900">
                        {job.customer_name || '—'}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {[job.vehicle_year, job.vehicle_make, job.vehicle_model]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </td>

                      {!shopUser ? (
                        <td className="px-5 py-4 text-slate-700">
                          {job.assigned_account_name || 'Unassigned'}
                        </td>
                      ) : null}

                      <td className="px-5 py-4">
                        <select
                          value={job.job_status || 'Assigned'}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            void updateJobStatus(job.id, e.target.value);
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(job.job_status)}`}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-slate-900">
                        {money(invoiceAmount)}
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-emerald-700">
                        {money(amountPaid)}
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-rose-700">
                        {money(unpaid)}
                      </td>

                      <td className="px-5 py-4 text-right">
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

              {!loading && !filteredJobs.length ? (
                <tr>
                  <td colSpan={shopUser ? 8 : 9} className="py-12 text-center text-slate-500">
                    No jobs found for this date range/status.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showAddJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Add Job</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a job assigned to a repair shop.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddJob(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
              {!shopUser ? (
                <label className="space-y-1 md:col-span-3">
                  <span className="text-sm font-medium text-slate-700">Assigned Shop</span>
                  <select
                    value={newJob.assigned_account_id}
                    onChange={(e) =>
                      setNewJob((current) => ({
                        ...current,
                        assigned_account_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select shop</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Customer Name</span>
                <input
                  value={newJob.customer_name}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, customer_name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Customer Phone</span>
                <input
                  value={newJob.customer_phone}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, customer_phone: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Customer Email</span>
                <input
                  value={newJob.customer_email}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, customer_email: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Year</span>
                <input
                  value={newJob.vehicle_year}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, vehicle_year: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Make</span>
                <input
                  value={newJob.vehicle_make}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, vehicle_make: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Model</span>
                <input
                  value={newJob.vehicle_model}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, vehicle_model: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">VIN</span>
                <input
                  value={newJob.vehicle_vin}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, vehicle_vin: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Damage Type</span>
                <input
                  value={newJob.damage_type}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, damage_type: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Invoice Date</span>
                <input
                  type="date"
                  value={newJob.invoice_date}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, invoice_date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Invoice Amount</span>
                <input
                  type="number"
                  step="0.01"
                  value={newJob.invoice_amount}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, invoice_amount: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Insurance Carrier</span>
                <input
                  value={newJob.insurance_carrier}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, insurance_carrier: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Claim Number</span>
                <input
                  value={newJob.claim_number}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, claim_number: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Policy Number</span>
                <input
                  value={newJob.policy_number}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, policy_number: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Loss Date</span>
                <input
                  type="date"
                  value={newJob.loss_date}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, loss_date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 md:col-span-3">
                <span className="text-sm font-medium text-slate-700">Damage Notes</span>
                <textarea
                  value={newJob.damage_notes}
                  onChange={(e) =>
                    setNewJob((current) => ({ ...current, damage_notes: e.target.value }))
                  }
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowAddJob(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingJob}
                onClick={() => void createJob()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingJob ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}