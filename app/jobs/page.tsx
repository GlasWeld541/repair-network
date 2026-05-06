'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Account = {
  id: string;
  name: string;
};

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
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(today());

  const [showCreate, setShowCreate] = useState(false);

  const [customer, setCustomer] = useState('');
  const [accountId, setAccountId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState(0);

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: user } = await supabase.auth.getUser();
    const email = user.user?.email?.toLowerCase();

    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_email', email)
      .maybeSingle();

    const admin = role?.role === 'admin';
    setIsAdmin(admin);

    if (admin) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('id, name')
        .order('name');

      setAccounts(acc || []);
    } else {
      const { data: shop } = await supabase
        .from('shop_users')
        .select('account_id')
        .eq('user_email', email)
        .maybeSingle();

      setAccountId(shop?.account_id || '');
    }

    const { data: jobs } = await supabase.from('jobs').select('*');

    if (!jobs) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = jobs.map(j => j.id);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('job_id, invoice_amount, amount_paid')
      .in('job_id', ids);

    const map = new Map();
    invoices?.forEach(i => map.set(i.job_id, i));

    const result = jobs.map(j => {
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
    if (!customer || !accountId) {
      alert('Missing fields');
      return;
    }

    const account = accounts.find(a => a.id === accountId);

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_name: customer,
        assigned_account_id: accountId,
        assigned_account_name: account?.name,
        job_status: 'New',
        invoice_amount: invoiceAmount,
        invoice_date: today(),
      })
      .select('*')
      .single();

    if (error) {
      alert('Failed to create job');
      return;
    }

    setShowCreate(false);
    setCustomer('');
    setInvoiceAmount(0);

    await load();

    router.push(`/jobs/${data.id}`);
  }

  const filtered = useMemo(() => {
    return rows.filter(j => {
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
    <div className="mx-auto max-w-[1380px] p-6 space-y-6">

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-semibold">All Jobs</h1>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-black text-white px-4 py-2 rounded"
        >
          + Add Job
        </button>
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="p-4 border rounded-xl bg-white shadow-sm space-y-3">
          <input
            placeholder="Customer name"
            value={customer}
            onChange={e => setCustomer(e.target.value)}
            className="border p-2 w-full"
          />

          {isAdmin && (
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="border p-2 w-full"
            >
              <option value="">Select account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          <input
            type="number"
            placeholder="Invoice amount"
            value={invoiceAmount}
            onChange={e => setInvoiceAmount(Number(e.target.value))}
            className="border p-2 w-full"
          />

          <div className="flex gap-2">
            <button onClick={createJob} className="bg-green-600 text-white px-3 py-1 rounded">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="border px-3 py-1 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Jobs" value={totals.jobs.toString()} />
        <Stat label="Sales" value={money(totals.sales)} />
        <Stat label="Paid" value={money(totals.paid)} tone="green" />
        <Stat label="Outstanding" value={money(totals.outstanding)} tone="red" />
      </div>

      {/* TABLE */}
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Shop</th>
              <th>Invoice</th>
              <th>Paid</th>
              <th>Outstanding</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(j => (
              <tr
                key={j.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/jobs/${j.id}`)}
              >
                <td>{(j.invoice_date || j.created_at || '').slice(0, 10)}</td>
                <td>{j.customer_name}</td>
                <td>{j.job_status}</td>
                <td>{j.assigned_account_name}</td>
                <td>{money(j.invoice_amount)}</td>
                <td className="text-green-600 font-semibold">{money(j.paid)}</td>
                <td className="text-red-600 font-semibold">{money(j.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: any) {
  const color =
    tone === 'green'
      ? 'text-green-600'
      : tone === 'red'
      ? 'text-red-600'
      : '';

  return (
    <div className="p-4 border rounded-xl bg-white shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}