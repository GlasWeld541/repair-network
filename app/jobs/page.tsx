'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  submitted_by_type: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  job_status: string | null;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  failure_reason: string | null;
  failure_notes: string | null;
  payment_status: string | null;
  billing_path: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  loss_date: string | null;
};

type ShopUser = {
  user_email: string;
  account_id: string;
  account_name: string;
  role: string;
};

const JOB_STATUSES = [
  'New',
  'Assigned',
  'Accepted',
  'Scheduled',
  'In Progress',
  'Repaired',
  'Could Not Repair',
  'Completed',
  'Declined',
  'Cancelled',
];

const PAYMENT_STATUSES = [
  'Unpaid',
  'Paid by Customer Card',
  'Cash Collected',
  'Check Collected',
  'Sent to Insurance',
  'Insurance Paid',
  'Denied',
  'Written Off',
];

const FAILURE_REASONS = [
  '',
  'Crack spread during repair',
  'Damage too large',
  'Edge crack',
  'Contamination',
  'Poor prior repair',
  'Customer declined after inspection',
  'Other',
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_zip: '',
    vehicle_year: '',
    vehicle_make: '',
    vehicle_model: '',
    damage_type: '',
    damage_notes: '',
  });

  const isShopUser = Boolean(shopUser?.account_id);

  useEffect(() => {
    void loadPage();
  }, []);

  async function loadPage() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email?.toLowerCase() ?? '';
    setUserEmail(email);

    let matchedShopUser: ShopUser | null = null;

    if (email) {
      const { data: shopData } = await supabase
        .from('shop_users')
        .select('user_email, account_id, account_name, role')
        .eq('user_email', email)
        .maybeSingle();

      matchedShopUser = (shopData as ShopUser | null) ?? null;
      setShopUser(matchedShopUser);
    }

    await loadJobs(matchedShopUser);
    setLoading(false);
  }

  async function loadJobs(currentShopUser = shopUser) {
    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentShopUser?.account_id) {
      query = query.eq('assigned_account_id', currentShopUser.account_id);
    }

    const { data, error } = await query;

    if (error) {
      window.alert('Could not load jobs.');
      return;
    }

    setJobs((data as JobRow[]) ?? []);
  }

  async function createJob() {
    const { error } = await supabase.from('jobs').insert({
      submitted_by_type: isShopUser ? 'Shop' : 'GlasWeld',
      submitted_by_email: userEmail || null,
      submitted_by_name: isShopUser ? shopUser?.account_name : 'GlasWeld',
      customer_name: form.customer_name.trim() || null,
      customer_phone: form.customer_phone.trim() || null,
      customer_email: form.customer_email.trim() || null,
      customer_zip: form.customer_zip.trim() || null,
      vehicle_year: form.vehicle_year.trim() || null,
      vehicle_make: form.vehicle_make.trim() || null,
      vehicle_model: form.vehicle_model.trim() || null,
      damage_type: form.damage_type.trim() || null,
      damage_notes: form.damage_notes.trim() || null,
      job_status: isShopUser ? 'Assigned' : 'New',
      assigned_account_id: isShopUser ? shopUser?.account_id : null,
      assigned_account_name: isShopUser ? shopUser?.account_name : null,
      payment_status: 'Unpaid',
    });

    if (error) {
      window.alert('Could not create job.');
      return;
    }

    setForm({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_zip: '',
      vehicle_year: '',
      vehicle_make: '',
      vehicle_model: '',
      damage_type: '',
      damage_notes: '',
    });

    await loadJobs();
  }

  async function updateJob(id: string, patch: Partial<JobRow>) {
    setSavingId(id);

    const { error } = await supabase.from('jobs').update(patch).eq('id', id);

    setSavingId(null);

    if (error) {
      window.alert('Could not update job.');
      return;
    }

    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job))
    );
  }

  const pageTitle = useMemo(() => {
    if (loading) return 'Jobs';
    if (isShopUser) return `${shopUser?.account_name} Jobs`;
    return 'All Jobs';
  }, [loading, isShopUser, shopUser]);

  if (loading) {
    return <div className="p-6 text-slate-600">Loading jobs...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">{pageTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isShopUser
            ? 'This dashboard only shows jobs assigned to your shop.'
            : 'Admin view: create jobs and monitor all network referrals.'}
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Create Job</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Customer name"
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Customer phone"
            value={form.customer_phone}
            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Customer email"
            value={form.customer_email}
            onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="ZIP code"
            value={form.customer_zip}
            onChange={(e) => setForm({ ...form, customer_zip: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Vehicle year"
            value={form.vehicle_year}
            onChange={(e) => setForm({ ...form, vehicle_year: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Vehicle make"
            value={form.vehicle_make}
            onChange={(e) => setForm({ ...form, vehicle_make: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Vehicle model"
            value={form.vehicle_model}
            onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Damage type"
            value={form.damage_type}
            onChange={(e) => setForm({ ...form, damage_type: e.target.value })}
          />

          <textarea
            className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 md:col-span-2 xl:col-span-3"
            placeholder="Damage notes"
            value={form.damage_notes}
            onChange={(e) => setForm({ ...form, damage_notes: e.target.value })}
          />
        </div>

        <button
          type="button"
          onClick={() => void createJob()}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create Job
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Job Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">
            {jobs.length} job{jobs.length === 1 ? '' : 's'} shown.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1400px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Damage</th>
                <th className="px-4 py-3">Assigned Shop</th>
                <th className="px-4 py-3">Job Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Could Not Repair</th>
              </tr>
            </thead>

            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{job.customer_name || '—'}</div>
                    <div className="text-slate-500">{job.customer_zip || ''}</div>
                  </td>

                  <td className="px-4 py-3">
                    <div>{job.customer_phone || '—'}</div>
                    <div className="text-slate-500">{job.customer_email || ''}</div>
                  </td>

                  <td className="px-4 py-3">
                    {[job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ') || '—'}
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{job.damage_type || '—'}</div>
                    <div className="max-w-[220px] text-slate-500">{job.damage_notes || ''}</div>
                  </td>

                  <td className="px-4 py-3">{job.assigned_account_name || 'Unassigned'}</td>

                  <td className="px-4 py-3">
                    <select
                      value={job.job_status || 'New'}
                      onChange={(e) => void updateJob(job.id, { job_status: e.target.value })}
                      disabled={savingId === job.id}
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      {JOB_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={job.payment_status || 'Unpaid'}
                      onChange={(e) => void updateJob(job.id, { payment_status: e.target.value })}
                      disabled={savingId === job.id}
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      {PAYMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    {job.job_status === 'Could Not Repair' ? (
                      <div className="space-y-2">
                        <select
                          value={job.failure_reason || ''}
                          onChange={(e) => void updateJob(job.id, { failure_reason: e.target.value })}
                          disabled={savingId === job.id}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1"
                        >
                          {FAILURE_REASONS.map((reason) => (
                            <option key={reason || 'empty'} value={reason}>
                              {reason || 'Select reason'}
                            </option>
                          ))}
                        </select>

                        <textarea
                          className="min-h-20 w-full rounded-lg border border-slate-300 px-2 py-1"
                          placeholder="Failure notes"
                          value={job.failure_notes || ''}
                          onChange={(e) =>
                            setJobs((current) =>
                              current.map((row) =>
                                row.id === job.id
                                  ? { ...row, failure_notes: e.target.value }
                                  : row
                              )
                            )
                          }
                          onBlur={(e) => void updateJob(job.id, { failure_notes: e.target.value })}
                        />
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {!jobs.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No jobs found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
