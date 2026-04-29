'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const YES_NO_UNKNOWN = ['Unknown', 'Yes', 'No'] as const;
const OUTREACH_OPTIONS = ['Not Contacted', 'Contacted', 'Qualified', 'Onboarded', 'In Progress'] as const;

type AccountRow = {
  id: string;
  account_name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  company_phone: string | null;
  company_email: string | null;
  glasweld_certified: string | null;
  insurance: string | null;
  uses_onyx: string | null;
  uses_zoom_injector: string | null;
  repair_only: string | null;
  outreach_status: string | null;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .order('account_name');

    setAccounts((data as AccountRow[]) || []);
  }

  async function updateAccount(id: string, field: string, value: string) {
    await supabase.from('accounts').update({ [field]: value }).eq('id', id);

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === id ? { ...account, [field]: value } : account
      )
    );
  }

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) =>
      `${account.account_name} ${account.city} ${account.state}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [accounts, query]);

  return (
    <div className="space-y-6">
      {/* HEADER (MATCHES CONTACTS) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Accounts</h1>
          <p className="text-sm text-slate-500">
            Click any account to open full detail view.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
              placeholder="Search account, city, state, phone..."
            />
          </div>
        </div>
      </div>

      {/* CARD (MATCHES CONTACTS EXACTLY) */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1000px] text-sm">
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
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {account.account_name}
                  </Link>
                </td>

                <td className="px-4 py-3">{account.city}</td>
                <td className="px-4 py-3">{account.state}</td>

                <td className="px-4 py-3">
                  <select
                    value={account.glasweld_certified || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(account.id, 'glasweld_certified', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={account.insurance || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(account.id, 'insurance', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={account.uses_onyx || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(account.id, 'uses_onyx', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={account.uses_zoom_injector || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(account.id, 'uses_zoom_injector', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={account.repair_only || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(account.id, 'repair_only', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={account.outreach_status || 'Not Contacted'}
                    onChange={(e) =>
                      updateAccount(account.id, 'outreach_status', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {OUTREACH_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}