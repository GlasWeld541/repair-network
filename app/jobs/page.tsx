'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Job = {
  id: string;
  customer_name: string | null;
  job_status: string | null;
  invoice_date: string | null;
  created_at: string;
  assigned_account_name: string | null;
};

type Invoice = {
  job_id: string;
  invoice_amount: number | null;
  amount_paid: number | null;
};

type JobRow = Job & {
  invoice_amount: number;
  paid: number;
  outstanding: number;
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

  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(today());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: jobs } = await supabase
      .from('jobs')
      .select('*');

    if (!jobs?.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = jobs.map(j => j.id);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('job_id, invoice_amount, amount_paid')
      .in('job_id', ids);

    const map = new Map<string, Invoice>();

    invoices?.forEach(i => map.set(i.job_id, i));

    const result: JobRow[] = jobs.map(j => {
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

      <h1 className="text-3xl font-semibold">All Jobs</h1>

      {/* FILTER */}
      <div className="p-4 border rounded-xl bg-white shadow-sm flex gap-3">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />

        <button
          onClick={() => {
            setStartDate(startOfMonth());
            setEndDate(today());
          }}
          className="bg-black text-white px-3 rounded"
        >
          Current Month
        </button>
      </div>

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