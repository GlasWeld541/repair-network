'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  const [newAccount, setNewAccount] = useState({
    account_name: '',
    street: '',
    city: '',
    state: '',
    postal_code: '',
    company_phone: '',
    company_email: '',
    glasweld_certified: 'Unknown',
    insurance: 'Unknown',
    uses_onyx: 'Unknown',
    uses_zoom_injector: 'Unknown',
    repair_only: 'Unknown',
    outreach_status: 'Not Contacted',
  });

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    const searchFromUrl = searchParams.get('search') || '';
    const stateFromUrl = searchParams.get('state') || 'all';

    setQuery(searchFromUrl);
    setStateFilter(stateFromUrl);
  }, [searchParams]);

  async function loadAccounts() {
    const { data } = await supabase.from('accounts').select('*').order('account_name');
    setAccounts((data as AccountRow[]) || []);
  }

  async function updateAccount(id: string, field: string, value: string) {
    await supabase.from('accounts').update({ [field]: value }).eq('id', id);

    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  }

  async function createAccount() {
    if (!newAccount.account_name.trim()) return;

    await supabase.from('accounts').insert([
      {
        ...newAccount,
        account_name: newAccount.account_name.trim(),
        street: newAccount.street.trim() || null,
        city: newAccount.city.trim() || null,
        state: newAccount.state.trim().toUpperCase() || null,
        postal_code: newAccount.postal_code.trim() || null,
        company_phone: newAccount.company_phone.trim() || null,
        company_email: newAccount.company_email.trim() || null,
      },
    ]);

    setNewAccount({
      account_name: '',
      street: '',
      city: '',
      state: '',
      postal_code: '',
      company_phone: '',
      company_email: '',
      glasweld_certified: 'Unknown',
      insurance: 'Unknown',
      uses_onyx: 'Unknown',
      uses_zoom_injector: 'Unknown',
      repair_only: 'Unknown',
      outreach_status: 'Not Contacted',
    });

    setAdding(false);
    void loadAccounts();
  }

  const states = useMemo(() => {
    return Array.from(
      new Set(
        accounts
          .map((a) => a.state?.trim().toUpperCase())
          .filter((value): value is string => Boolean(value))
      )
    ).sort();
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const normalizedAccountState = a.state?.trim().toUpperCase() || '';
      const normalizedSelectedState = stateFilter.trim().toUpperCase();

      const haystack = [
        a.account_name ?? '',
        a.street ?? '',
        a.city ?? '',
        a.state ?? '',
        a.postal_code ?? '',
        a.company_phone ?? '',
        a.company_email ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesQuery = haystack.includes(query.trim().toLowerCase());
      const matchesState =
        stateFilter === 'all' || normalizedAccountState === normalizedSelectedState;

      return matchesQuery && matchesState;
    });
  }, [accounts, query, stateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            Click any account to open full detail view.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3"
              placeholder="Search account, city, state, phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:w-[140px]"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">All states</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>

          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Add Account
          </button>
        </div>
      </div>

      {adding && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <input
              placeholder="Account Name"
              value={newAccount.account_name}
              onChange={(e) =>
                setNewAccount({ ...newAccount, account_name: e.target.value })
              }
              className="rounded border px-3 py-2"
            />
            <input
              placeholder="Street"
              value={newAccount.street}
              onChange={(e) =>
                setNewAccount({ ...newAccount, street: e.target.value })
              }
              className="rounded border px-3 py-2"
            />
            <input
              placeholder="City"
              value={newAccount.city}
              onChange={(e) =>
                setNewAccount({ ...newAccount, city: e.target.value })
              }
              className="rounded border px-3 py-2"
            />
            <input
              placeholder="State"
              value={newAccount.state}
              onChange={(e) =>
                setNewAccount({ ...newAccount, state: e.target.value.toUpperCase() })
              }
              className="rounded border px-3 py-2"
              maxLength={2}
            />
            <input
              placeholder="Zip"
              value={newAccount.postal_code}
              onChange={(e) =>
                setNewAccount({ ...newAccount, postal_code: e.target.value })
              }
              className="rounded border px-3 py-2"
            />
            <input
              placeholder="Phone"
              value={newAccount.company_phone}
              onChange={(e) =>
                setNewAccount({ ...newAccount, company_phone: e.target.value })
              }
              className="rounded border px-3 py-2"
            />
            <input
              placeholder="Email"
              value={newAccount.company_email}
              onChange={(e) =>
                setNewAccount({ ...newAccount, company_email: e.target.value })
              }
              className="rounded border px-3 py-2"
            />
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={createAccount}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save Account
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Certified</th>
              <th className="px-4 py-3">Insurance</th>
              <th className="px-4 py-3">ONYX</th>
              <th className="px-4 py-3">Zoom</th>
              <th className="px-4 py-3">Repair Only</th>
              <th className="px-4 py-3">Outreach</th>
            </tr>
          </thead>

          <tbody>
            {filteredAccounts.map((a) => (
              <tr key={a.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link
                    href={`/accounts/${a.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {a.account_name}
                  </Link>
                </td>

                <td className="px-4 py-3">{a.city}</td>
                <td className="px-4 py-3">{a.state}</td>

                <td className="px-4 py-3">
                  <select
                    value={a.glasweld_certified || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(a.id, 'glasweld_certified', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={a.insurance || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(a.id, 'insurance', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={a.uses_onyx || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(a.id, 'uses_onyx', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={a.uses_zoom_injector || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(a.id, 'uses_zoom_injector', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={a.repair_only || 'Unknown'}
                    onChange={(e) =>
                      updateAccount(a.id, 'repair_only', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {YES_NO_UNKNOWN.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={a.outreach_status || 'Not Contacted'}
                    onChange={(e) =>
                      updateAccount(a.id, 'outreach_status', e.target.value)
                    }
                    className="rounded border px-2 py-1"
                  >
                    {OUTREACH_OPTIONS.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}

            {!filteredAccounts.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}