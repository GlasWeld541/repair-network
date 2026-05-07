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
  assigned_account_name: string | null;
};

type Invoice = {
  job_id: string;
  invoice_amount: number | null;
  amount_paid: number | null;
};

type Role = 'admin' | 'shop' | null;

function money(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export default function JobsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(today());

  const [showCreate, setShowCreate] = useState(false);
  const [customer, setCustomer] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: user } = await supabase.auth.getUser();
    const email = user.user?.email?.toLowerCase();

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_email', email)
      .maybeSingle();

    setRole(roleData?.role);

    if (roleData?.role === 'admin') {
      const { data } = await supabase
        .from('accounts')
        .select('id, account_name')
        .order('account_name');

      setAccounts(data || []);
    } else {
      const { data: shop } = await supabase
        .from('shop_users')
        .select('account_id')
        .eq('user_email', email)
        .maybeSingle();

      setAccountId(shop?.account_id || '');
    }

    const { data: jobs } = await supabase.from('jobs').select('*');

    if (!jobs?.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = jobs.map((j) => j.id);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('job_id, invoice_amount, amount_paid')
      .in('job_id', ids);

    const map = new Map();
    invoices?.forEach((i) => map.set(i.job_id, i));

    const result = jobs.map((j) => {
      const inv = map.get(j.id);

      const total = Number(inv?.invoice_amount ?? 0);
      const paid = Number(inv?.amount_paid ?? 0);

      return {
        ...j,
        invoice_amount: total,
        paid,
        outstanding: Math.max(total - paid, 0),
      };
    });

    setRows(result);
    setLoading(false);
  }

  async function createJob() {
    if (!customer) return;

    const selected = accounts.find((a) => a.id === accountId);

    const { data } = await supabase
      .from('jobs')
      .insert({
        customer_name: customer,
        assigned_account_id: accountId,
        assigned_account_name: selected?.account_name,
        job_status: 'New',
        invoice_amount: amount,
        invoice_date: today(),
      })
      .select('*')
      .single();

    router.push(`/jobs/${data.id}`);
  }

  const filtered = useMemo(() => {
    return rows.filter((j) => {
      const d = (j.invoice_date || j.created_at || '').slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [rows, startDate, endDate]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (t, j) => {
        t.jobs++;
        t.sales += j.invoice_amount;
        t.paid += j.paid;
        t.outstanding += j.outstanding;
        return t;
      },
      { jobs: 0, sales: 0, paid: 0, outstanding: 0 }
    );
  }, [filtered]);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-semibold text-ink">Jobs</h1>

        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          + Add Job
        </button>
      </div>

      {/* CREATE */}
      {showCreate && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="grid gap-2 md:grid-cols-3">

            <input
              placeholder="Customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />

            {role === 'admin' && (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">Account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="number"
              placeholder="Invoice"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />

          </div>

          <button
            onClick={createJob}
            className="mt-3 rounded bg-emerald-600 px-3 py-1 text-sm text-white"
          >
            Create
          </button>
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Jobs" value={totals.jobs} />
        <Stat label="Sales" value={money(totals.sales)} />
        <Stat label="Paid" value={money(totals.paid)} green />
        <Stat label="Outstanding" value={money(totals.outstanding)} red />
      </div>

      {/* TABLE (matches accounts) */}
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
            {filtered.map((j) => (
              <tr
                key={j.id}
                onClick={() => router.push(`/jobs/${j.id}`)}
                className="border-t hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-3">
                  {(j.invoice_date || j.created_at || '').slice(0, 10)}
                </td>
                <td className="px-4 py-3 font-medium">{j.customer_name}</td>
                <td className="px-4 py-3">{j.job_status}</td>
                <td className="px-4 py-3">{j.assigned_account_name}</td>
                <td className="px-4 py-3">{money(j.invoice_amount)}</td>
                <td className="px-4 py-3 text-green-600 font-semibold">
                  {money(j.paid)}
                </td>
                <td className="px-4 py-3 text-red-600 font-semibold">
                  {money(j.outstanding)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Stat({ label, value, green, red }: any) {
  const color = green ? 'text-green-600' : red ? 'text-red-600' : '';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}