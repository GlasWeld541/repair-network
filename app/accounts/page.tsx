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

function getInitialSearch() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('search') || '';
}

function getInitialState() {
  if (typeof window === 'undefined') return 'all';
  return new URLSearchParams(window.location.search).get('state') || 'all';
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState(getInitialSearch);
  const [stateFilter, setStateFilter] = useState(getInitialState);

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

    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('search') || '');
    setStateFilter(params.get('state') || 'all');
  }, []);

  async function loadAccounts() {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;

    const { data: shopUser } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    let queryBuilder = supabase.from('accounts').select('*');

    if (shopUser?.account_id) {
      queryBuilder = queryBuilder.eq('id', shopUser.account_id);
    }

    const { data } = await queryBuilder.order('account_name');

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
          .map((account) => account.state?.trim().toUpperCase())
          .filter((value): value is string => Boolean(value))
      )
    ).sort();
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedSelectedState = stateFilter.trim().toUpperCase();

    return accounts.filter((account) => {
      const normalizedAccountState = account.state?.trim().toUpperCase() || '';

      const haystack = [
        account.account_name ?? '',
        account.street ?? '',
        account.city ?? '',
        account.state ?? '',
        account.postal_code ?? '',
        account.company_phone ?? '',
        account.company_email ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesState =
        normalizedSelectedState === 'ALL' ||
        normalizedSelectedState === '' ||
        normalizedAccountState === normalizedSelectedState;

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
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
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
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="text-blue-600 hover:underline"
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