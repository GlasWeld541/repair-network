'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  company_email: string | null;
  company_phone: string | null;
};

type PaymentSettingsRow = {
  gateway_provider: string | null;
  gateway_account_id: string | null;
  insurance_submission_method: string | null;
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

function invoiceNumber() {
  return `INV-${Date.now()}`;
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

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);
  const [creatingInvoiceId, setCreatingInvoiceId] = useState<string | null>(null);

  const [showAddJob, setShowAddJob] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [newJob, setNewJob] = useState<NewJobForm>(emptyJobForm());

  const [dateFrom, setDateFrom] = useState(startOfCurrentMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

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
        .select('id, account_name, street, city, state, postal_code, company_email, company_phone')
        .order('account_name');

      setAccounts((accountData as AccountRow[]) || []);
    } else {
      setAccounts([
        {
          id: currentShopUser.account_id,
          account_name: currentShopUser.account_name,
          street: null,
          city: null,
          state: null,
          postal_code: null,
          company_email: null,
          company_phone: null,
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

    if (dateFrom) {
      query = query.gte('invoice_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('invoice_date', dateTo);
    }

    const { data: jobData } = await query;
    const baseJobs = (jobData as JobRow[]) || [];

    if (!baseJobs.length) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const jobIds = baseJobs.map((job) => job.id);

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select(
        'id, job_id, invoice_amount, amount_paid, status, payment_status, submission_status'
      )
      .in('job_id', jobIds);

    const invoices = (invoiceData as InvoiceRow[]) || [];
    const invoiceByJobId = new Map<string, InvoiceRow>();

    invoices.forEach((invoice) => {
      invoiceByJobId.set(invoice.job_id, invoice);
    });

    const mergedJobs: JobWithInvoice[] = baseJobs.map((job) => ({
      ...job,
      invoice: invoiceByJobId.get(job.id) || null,
    }));

    setJobs(mergedJobs);
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

  async function generateInvoice(job: JobWithInvoice) {
    setCreatingInvoiceId(job.id);

    try {
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('job_id', job.id)
        .maybeSingle();

      if (existingInvoice?.id) {
        window.location.href = `/jobs/${job.id}`;
        return;
      }

      let account: AccountRow | null = null;
      let settings: PaymentSettingsRow | null = null;

      if (job.assigned_account_id) {
        const [{ data: accountData }, { data: settingsData }] = await Promise.all([
          supabase
            .from('accounts')
            .select(
              'id, account_name, street, city, state, postal_code, company_email, company_phone'
            )
            .eq('id', job.assigned_account_id)
            .maybeSingle(),
          supabase
            .from('account_payment_settings')
            .select('gateway_provider, gateway_account_id, insurance_submission_method')
            .eq('account_id', job.assigned_account_id)
            .maybeSingle(),
        ]);

        account = (accountData as AccountRow | null) || null;
        settings = (settingsData as PaymentSettingsRow | null) || null;
      }

      const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
        .filter(Boolean)
        .join(' ');

      const { data: invoiceData, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber(),
          job_id: job.id,
          account_id: job.assigned_account_id,

          account_name: account?.account_name || job.assigned_account_name,
          account_street: account?.street || null,
          account_city: account?.city || null,
          account_state: account?.state || null,
          account_postal_code: account?.postal_code || null,
          account_email: account?.company_email || null,
          account_phone: account?.company_phone || null,

          customer_name: job.customer_name,
          customer_email: job.customer_email,
          customer_phone: job.customer_phone,

          vehicle,
          vin: job.vehicle_vin,
          damage_type: job.damage_type,
          damage_notes: job.damage_notes,

          invoice_amount: Number(job.invoice_amount || 0),
          amount_paid: Number(job.amount_paid || 0),

          insurance_carrier: job.insurance_carrier,
          claim_number: job.claim_number,
          policy_number: job.policy_number,
          loss_date: job.loss_date,

          submission_method: settings?.insurance_submission_method || 'Not Set',
          gateway_provider: settings?.gateway_provider || null,
          gateway_account_id: settings?.gateway_account_id || null,
        })
        .select('id')
        .single();

      if (error) {
        window.alert('Could not generate invoice.');
        return;
      }

      if (invoiceData?.id) {
        await supabase.from('invoice_events').insert({
          invoice_id: invoiceData.id,
          event_type: 'Created',
          note: 'Invoice generated from Jobs screen.',
        });
      }

      window.location.href = `/jobs/${job.id}`;
    } finally {
      setCreatingInvoiceId(null);
    }
  }

  const totals = useMemo(() => {
    return jobs.reduce(
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
  }, [jobs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {shopUser?.account_name ? `${shopUser.account_name} Jobs` : 'Jobs'}
          </h1>
          <p className="text-sm text-slate-500">
            {shopUser
              ? 'This view only shows jobs assigned to your business.'
              : 'Track jobs, invoices, insurance submission, and future payment collection.'}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <button
            type="button"
            onClick={openAddJob}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add Job
          </button>

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
              {!shopUser ? <th className="px-4 py-3">Assigned Shop</th> : null}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Unpaid</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={shopUser ? 8 : 9}
                  className="py-10 text-center text-slate-500"
                >
                  Loading jobs...
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const invoiceAmount = displayInvoiceAmount(job);
                const amountPaid = displayAmountPaid(job);
                const unpaid = displayUnpaid(job);

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

                    {!shopUser ? (
                      <td className="px-4 py-3">
                        {job.assigned_account_name || 'Unassigned'}
                      </td>
                    ) : null}

                    <td className="px-4 py-3">{job.job_status || '—'}</td>

                    <td className="px-4 py-3">{money(invoiceAmount)}</td>

                    <td className="px-4 py-3">{money(amountPaid)}</td>

                    <td className="px-4 py-3 font-medium text-rose-700">
                      {money(unpaid)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={creatingInvoiceId === job.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void generateInvoice(job);
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {creatingInvoiceId === job.id ? 'Creating...' : 'Invoice'}
                        </button>

                        <Link
                          href={`/jobs/${job.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}

            {!loading && !jobs.length ? (
              <tr>
                <td
                  colSpan={shopUser ? 8 : 9}
                  className="py-10 text-center text-slate-500"
                >
                  No jobs found for this date range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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