'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Account = {
  id: string;
  name: string;
  billing_city: string | null;
  billing_state: string | null;
  glasweld_certified: string | null;
  insurance: string | null;
  onyx: string | null;
  zoom: string | null;
  repair_only: string | null;
  outreach: string | null;
};

export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .order('name')
      .limit(2000);

    setRows((data as Account[]) || []);
  }

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      `${r.name} ${r.billing_city} ${r.billing_state}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [rows, query]);

  async function updateField(id: string, field: keyof Account, value: string) {
    await supabase.from('accounts').update({ [field]: value }).eq('id', id);

    setRows((r) =>
      r.map((x) => (x.id === id ? { ...x, [field]: value } : x))
    );
  }

  function dropdown(row: Account, field: keyof Account) {
    return (
      <select
        value={(row[field] as string) || 'Unknown'}
        onChange={(e) => updateField(row.id, field, e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      >
        <option>Unknown</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Accounts</h1>
          <p className="text-sm text-slate-500">
            Click any account to open full detail view.
          </p>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
          placeholder="Search account, city, state..."
        />
      </div>

      {/* ✅ THIS IS THE FIXED CARD */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1200px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">State</th>
              <th className="px-4 py-3 font-semibold">Certified</th>
              <th className="px-4 py-3 font-semibold">Insurance</th>
              <th className="px-4 py-3 font-semibold">ONYX</th>
              <th className="px-4 py-3 font-semibold">Zoom</th>
              <th className="px-4 py-3 font-semibold">Repair Only</th>
              <th className="px-4 py-3 font-semibold">Outreach</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link
                    href={`/accounts/${row.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>

                <td className="px-4 py-3">{row.billing_city}</td>
                <td className="px-4 py-3">{row.billing_state}</td>

                <td className="px-4 py-3">
                  {dropdown(row, 'glasweld_certified')}
                </td>
                <td className="px-4 py-3">
                  {dropdown(row, 'insurance')}
                </td>
                <td className="px-4 py-3">{dropdown(row, 'onyx')}</td>
                <td className="px-4 py-3">{dropdown(row, 'zoom')}</td>
                <td className="px-4 py-3">
                  {dropdown(row, 'repair_only')}
                </td>
                <td className="px-4 py-3">
                  {dropdown(row, 'outreach')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}