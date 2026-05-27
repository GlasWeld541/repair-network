'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Account = {
  id: string;
  account_name: string | null;
};

type RoleRow = {
  role: Role;
  approved: boolean;
  access_status: string | null;
  account_id: string | null;
  carrier_id: string | null;
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
};

type JobWithInvoice = Job & {
  invoice: Invoice | null;
};

type Role = 'admin' | 'shop' | 'carrier' | 'demo' | null;
type ViewMode = 'open' | 'current' | 'submitted' | 'over30' | 'over60' | 'paid' | 'custom';

function money(v: number | null | undefined) {
  return Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfCurrentMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function invoiceAmount(j: JobWithInvoice) {
  return Number(j.invoice?.invoice_amount ?? j.invoice_amount ?? 0);
}

function paidAmount(j: JobWithInvoice) {
  return Number(j.invoice?.amount_paid ?? j.amount_paid ?? 0);
}

function outstandingAmount(j: JobWithInvoice) {
  return Math.max(invoiceAmount(j) - paidAmount(j), 0);
}

function jobDate(j: JobWithInvoice) {
  return (j.invoice_date || j.created_at || '').slice(0, 10);
}

function daysOutstanding(j: JobWithInvoice) {
  if (outstandingAmount(j) <= 0) return 0;
  const start = new Date(jobDate(j));
  return Math.floor((Date.now() - start.getTime()) / 86400000);
}

export default function JobsPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<JobWithInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [startDate, setStartDate] = useState(firstDayOfCurrentMonthIso());
  const [endDate, setEndDate] = useState(todayIso());

  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newAmount, setNewAmount] = useState<number>(0);
  const [newInvoiceDate, setNewInvoiceDate] = useState(todayIso());
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newVehicleYear, setNewVehicleYear] = useState('');
  const [newVehicleMake, setNewVehicleMake] = useState('');
  const [newVehicleModel, setNewVehicleModel] = useState('');
  const [newInsuranceCarrier, setNewInsuranceCarrier] = useState('');
  const [newClaimNumber, setNewClaimNumber] = useState('');
  const [creating, setCreating] = useState(false);

  const isReadOnly = role === 'demo';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status, account_id, carrier_id')
      .eq('user_email', email)
      .maybeSingle<RoleRow>();

    setRole(roleData?.role || null);

    if (!roleData || !roleData.approved || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    if (roleData.role === 'carrier') {
      window.location.href = '/claims';
      return;
    }

    let jobQuery = supabase.from('jobs').select('*');

    if (roleData.role === 'shop') {
      if (!roleData.account_id) {
        setJobs([]);
        setAccounts([]);
        setLoading(false);
        return;
      }

      jobQuery = jobQuery.eq('assigned_account_id', roleData.account_id);
    }

    const { data: jobData } = await jobQuery.order('created_at', { ascending: false });

    if (roleData.role === 'admin') {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, account_name')
        .order('account_name');

      setAccounts((accountData as Account[]) || []);
    } else if (roleData.role === 'shop' && roleData.account_id) {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, account_name')
        .eq('id', roleData.account_id)
        .maybeSingle();

      setAccounts(accountData ? [accountData as Account] : []);
      setNewAccountId(roleData.account_id);
    }

    const jobIds = (jobData || []).map((j) => j.id);

    const { data: invoiceData } = jobIds.length
      ? await supabase
          .from('invoices')
          .select('*')
          .in('job_id', jobIds)
      : { data: [] };

    const map = new Map();
    (invoiceData || []).forEach((i) => map.set(i.job_id, i));

    setJobs((jobData || []).map((j) => ({ ...j, invoice: map.get(j.id) || null })));

    setLoading(false);
  }

  async function createJob() {
    if (isReadOnly) return;

    const selectedAccount = accounts.find((account) => account.id === newAccountId);

    if (!newCustomer.trim()) {
      window.alert('Customer name is required.');
      return;
    }

    if (!selectedAccount) {
      window.alert('Select an account before creating the job.');
      return;
    }

    setCreating(true);

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_name: newCustomer.trim(),
        assigned_account_id: selectedAccount.id,
        assigned_account_name: selectedAccount.account_name,
        job_status: 'New',
        invoice_amount: Number(newAmount || 0),
        amount_paid: 0,
        invoice_date: newInvoiceDate || todayIso(),
        customer_phone: newCustomerPhone.trim() || null,
        vehicle_year: newVehicleYear.trim() || null,
        vehicle_make: newVehicleMake.trim() || null,
        vehicle_model: newVehicleModel.trim() || null,
        insurance_carrier: newInsuranceCarrier.trim() || null,
        claim_number: newClaimNumber.trim() || null,
      })
      .select('id')
      .single();

    setCreating(false);

    if (error) {
      window.alert(`Could not create job: ${error.message}`);
      return;
    }

    setNewCustomer('');
    setNewAmount(0);
    setNewInvoiceDate(todayIso());
    setNewCustomerPhone('');
    setNewVehicleYear('');
    setNewVehicleMake('');
    setNewVehicleModel('');
    setNewInsuranceCarrier('');
    setNewClaimNumber('');
    setShowCreate(false);

    if (data?.id) {
      router.push(`/jobs/${data.id}`);
    }
  }

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const balance = outstandingAmount(j);
      const days = daysOutstanding(j);

      if (viewMode === 'open') return balance > 0;
      if (viewMode === 'submitted') return j.invoice?.submission_status === 'Submitted' && balance > 0;
      if (viewMode === 'over30') return balance > 0 && days >= 30;
      if (viewMode === 'over60') return balance > 0 && days >= 60;
      if (viewMode === 'paid') return balance <= 0;

      const d = jobDate(j);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;

      return true;
    });
  }, [jobs, viewMode, startDate, endDate]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (t, j) => {
        t.sales += invoiceAmount(j);
        t.paid += paidAmount(j);
        t.outstanding += outstandingAmount(j);
        return t;
      },
      { sales: 0, paid: 0, outstanding: 0 }
    );
  }, [filtered]);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Jobs Ledger</h1>
          <p className="text-sm text-slate-500">Receivables + job tracking</p>
        </div>

        {!isReadOnly && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-slate-800"
          >
            + Add Job
          </button>
        )}
      </div>

      {showCreate && !isReadOnly ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Add Job</h2>
              <p className="mt-1 text-xs text-slate-500">
                Create the job here, then open it to add photos, invoice details, and payments.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              placeholder="Customer name"
              className="h-11"
            />

            <input
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
              placeholder="Customer phone"
              className="h-11"
            />

            <select
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              disabled={role === 'shop'}
              className="h-11 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name || 'Unnamed Account'}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={newInvoiceDate}
              onChange={(e) => setNewInvoiceDate(e.target.value)}
              className="h-11"
            />

            <div className="grid grid-cols-3 gap-2">
              <input
                value={newVehicleYear}
                onChange={(e) => setNewVehicleYear(e.target.value)}
                placeholder="Year"
                className="h-11"
              />

              <input
                value={newVehicleMake}
                onChange={(e) => setNewVehicleMake(e.target.value)}
                placeholder="Make"
                className="h-11"
              />

              <input
                value={newVehicleModel}
                onChange={(e) => setNewVehicleModel(e.target.value)}
                placeholder="Model"
                className="h-11"
              />
            </div>

            <input
              value={newInsuranceCarrier}
              onChange={(e) => setNewInsuranceCarrier(e.target.value)}
              placeholder="Insurance carrier"
              className="h-11"
            />

            <input
              value={newClaimNumber}
              onChange={(e) => setNewClaimNumber(e.target.value)}
              placeholder="Claim number"
              className="h-11"
            />

            <input
              type="number"
              step="0.01"
              min="0"
              value={newAmount}
              onChange={(e) => setNewAmount(Number(e.target.value))}
              placeholder="Invoice amount"
              className="h-11"
            />

            <div className="flex gap-2 xl:justify-end">
              <button
                type="button"
                disabled={creating}
                onClick={() => void createJob()}
                className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* FILTER BAR (FIXED ALIGNMENT) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">

          {/* BUTTON GROUP */}
          <div className="flex flex-wrap gap-2">
            <Filter active={viewMode === 'open'} onClick={() => setViewMode('open')}>Open</Filter>
            <Filter active={viewMode === 'current'} onClick={() => setViewMode('current')}>Month</Filter>
            <Filter active={viewMode === 'submitted'} onClick={() => setViewMode('submitted')}>Submitted</Filter>
            <Filter active={viewMode === 'over30'} onClick={() => setViewMode('over30')}>30+</Filter>
            <Filter active={viewMode === 'over60'} onClick={() => setViewMode('over60')}>60+</Filter>
            <Filter active={viewMode === 'paid'} onClick={() => setViewMode('paid')}>Paid</Filter>
          </div>

          {/* DATE GROUP */}
          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setViewMode('custom');
              }}
              className="rounded border px-2 py-1 text-sm"
            />

            <span className="text-slate-400">—</span>

            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setViewMode('custom');
              }}
              className="rounded border px-2 py-1 text-sm"
            />

            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="rounded border px-3 py-1 text-sm"
            >
              Clear
            </button>
          </div>

        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Sales" value={money(totals.sales)} />
        <Stat label="Paid" value={money(totals.paid)} green />
        <Stat label="Outstanding" value={money(totals.outstanding)} red />
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-soft">
        <table className="min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Claim</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Aging</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((j) => (
              <tr
                key={j.id}
                onClick={() => router.push(`/jobs/${j.id}`)}
                className="cursor-pointer border-t hover:bg-slate-50"
              >
                <td className="px-4 py-3">{jobDate(j)}</td>
                <td className="px-4 py-3">{j.customer_name}</td>
                <td className="px-4 py-3">{j.insurance_carrier}</td>
                <td className="px-4 py-3">{j.claim_number}</td>
                <td className="px-4 py-3">{money(invoiceAmount(j))}</td>
                <td className="px-4 py-3 text-emerald-700">{money(paidAmount(j))}</td>
                <td className="px-4 py-3 text-rose-700">{money(outstandingAmount(j))}</td>
                <td className="px-4 py-3">{daysOutstanding(j)}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Filter({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded bg-slate-950 px-3 py-1 text-sm text-white'
          : 'rounded border px-3 py-1 text-sm'
      }
    >
      {children}
    </button>
  );
}

function Stat({ label, value, green, red }: any) {
  const color = green ? 'text-emerald-700' : red ? 'text-rose-700' : '';

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-soft">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
