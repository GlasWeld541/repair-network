'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const YES_NO_UNKNOWN = ['Unknown', 'Yes', 'No'] as const;
const OUTREACH_OPTIONS = [
  'Not Contacted',
  'Contacted',
  'Qualified',
  'Onboarded',
  'In Progress',
] as const;

type AccountRow = {
  id: string;
  account_name: string | null;
  city: string | null;
  state: string | null;
  glasweld_certified: string | null;
  insurance: string | null;
  uses_onyx: string | null;
  uses_zoom_injector: string | null;
  repair_only: string | null;
  outreach_status: string | null;
};

type Role = 'admin' | 'shop' | 'carrier' | 'demo' | null;

function AccountsPageContent() {
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  const isReadOnly = role === 'demo';

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    setQuery(searchParams.get('search') || '');
    setStateFilter((searchParams.get('state') || '').trim().toUpperCase());
  }, [searchParams]);

  async function loadAccounts() {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (!roleData || !roleData.approved || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    setRole(roleData.role);

    if (roleData.role === 'admin' || roleData.role === 'demo') {
      const { data } = await supabase
        .from('accounts')
        .select(
          'id, account_name, city, state, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status'
        )
        .order('account_name');

      setAccounts((data as AccountRow[]) || []);
      return;
    }

    const { data: shopData } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    if (!shopData?.account_id) {
      setAccounts([]);
      return;
    }

    const { data } = await supabase
      .from('accounts')
      .select(
        'id, account_name, city, state, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status'
      )
      .eq('id', shopData.account_id);

    setAccounts((data as AccountRow[]) || []);
  }

  async function updateAccount(
    id: string,
    field: keyof AccountRow,
    value: string
  ) {
    if (isReadOnly) return;

    await supabase
      .from('accounts')
      .update({ [field]: value })
      .eq('id', id);

    setAccounts((current) =>
      current.map((account) =>
        account.id === id ? { ...account, [field]: value } : account
      )
    );
  }

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const haystack = [
        account.account_name ?? '',
        account.city ?? '',
        account.state ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !query.trim() || haystack.includes(query.toLowerCase());

      const matchesState =
        !stateFilter || (account.state || '').toUpperCase() === stateFilter;

      return matchesSearch && matchesState;
    });
  }, [accounts, query, stateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Accounts</h1>
          <p className="text-sm text-slate-500">
            {role === 'admin'
              ? 'Full access'
              : role === 'demo'
                ? 'Demo view only'
                : 'You only have access to your assigned account.'}
          </p>
        </div>

        {isReadOnly ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            View Only
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1180px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Certified</th>
              <th className="px-4 py-3">Insurance</th>
              <th className="px-4 py-3">Onyx</th>
              <th className="px-4 py-3">Zoom</th>
              <th className="px-4 py-3">Repair Only</th>
              <th className="px-4 py-3">Outreach</th>
            </tr>
          </thead>

          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {account.account_name || 'Unnamed Account'}
                  </Link>
                </td>

                <td className="px-4 py-3">{account.city || '—'}</td>
                <td className="px-4 py-3">{account.state || '—'}</td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.glasweld_certified || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'glasweld_certified', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.insurance || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'insurance', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.uses_onyx || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'uses_onyx', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.uses_zoom_injector || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'uses_zoom_injector', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.repair_only || 'Unknown'}
                    options={YES_NO_UNKNOWN}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'repair_only', value)
                    }
                  />
                </td>

                <td className="px-4 py-3">
                  <EditableCell
                    value={account.outreach_status || 'Not Contacted'}
                    options={OUTREACH_OPTIONS}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateAccount(account.id, 'outreach_status', value)
                    }
                  />
                </td>
              </tr>
            ))}

            {!filteredAccounts.length && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-500">
                  No accounts available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableCell({
  value,
  options,
  readOnly,
  onChange,
}: {
  value: string;
  options: readonly string[];
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  if (readOnly) {
    return (
      <span className="text-sm text-slate-900">
        {value || '—'}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-slate-300 px-2 py-1 text-sm"
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <AccountsPageContent />
    </Suspense>
  );
}