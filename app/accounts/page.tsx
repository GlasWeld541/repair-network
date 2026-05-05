'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type AccountRow = {
  id: string;
  account_name: string | null;
  city: string | null;
  state: string | null;
  certified: string | null;
  insurance: string | null;
  onyx: string | null;
  zoom: string | null;
  repair_only: string | null;
  outreach_stage: string | null;
};

type Role = 'admin' | 'shop' | 'carrier' | null;

function badge(value: string | null) {
  const text = value || 'Unknown';

  const classes =
    text === 'Yes'
      ? 'bg-emerald-100 text-emerald-800'
      : text === 'No'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-slate-100 text-slate-600';

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${classes}`}>
      {text}
    </span>
  );
}

function AccountsPageContent() {
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');

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

    if (roleData.role === 'admin') {
      const { data } = await supabase
        .from('accounts')
        .select(
          'id, account_name, city, state, certified, insurance, onyx, zoom, repair_only, outreach_stage'
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
        'id, account_name, city, state, certified, insurance, onyx, zoom, repair_only, outreach_stage'
      )
      .eq('id', shopData.account_id);

    setAccounts((data as AccountRow[]) || []);
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

      const matchesSearch = !query.trim() || haystack.includes(query.toLowerCase());
      const matchesState =
        !stateFilter || (account.state || '').toUpperCase() === stateFilter;

      return matchesSearch && matchesState;
    });
  }, [accounts, query, stateFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Accounts</h1>
        <p className="text-sm text-slate-500">
          {role === 'admin'
            ? 'Full access'
            : 'You only have access to your assigned account.'}
        </p>
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
                  <Link href={`/accounts/${account.id}`} className="text-blue-700 hover:underline">
                    {account.account_name || 'Unnamed Account'}
                  </Link>
                </td>
                <td className="px-4 py-3">{account.city || '—'}</td>
                <td className="px-4 py-3">{account.state || '—'}</td>
                <td className="px-4 py-3">{badge(account.certified)}</td>
                <td className="px-4 py-3">{badge(account.insurance)}</td>
                <td className="px-4 py-3">{badge(account.onyx)}</td>
                <td className="px-4 py-3">{badge(account.zoom)}</td>
                <td className="px-4 py-3">{badge(account.repair_only)}</td>
                <td className="px-4 py-3">{account.outreach_stage || '—'}</td>
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

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <AccountsPageContent />
    </Suspense>
  );
}