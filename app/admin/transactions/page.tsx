'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadAllAccounts } from '@/lib/load-all-accounts';
import { ListPageSkeleton } from '@/components/ui/skeleton';

/**
 * Every attempt to collect a GlasWeld fee, in one place (demo call 2026-09-29).
 *
 * Until now the only way to see charges was the Braintree control panel, and most of the team
 * doesn't have (and shouldn't need) a Braintree login. Everything here is already recorded on the
 * fee itself by the charge path and the Braintree webhook: the transaction id, when it was
 * attempted, and why it failed or was taken back. So this page reads our own records only.
 */

type Fee = {
  id: string;
  account_id: string;
  job_id: string | null;
  amount_cents: number | null;
  status: string;
  occurred_at: string;
  paid_at: string | null;
  charge_attempted_at: string | null;
  charge_error: string | null;
  gateway_transaction_id: string | null;
};

type Outcome = 'paid' | 'declined' | 'no_card' | 'disputed' | 'dispute_lost' | 'returned' | 'pending';

// The texts below are written by lib/payments (charge-fee.ts and webhook.ts); keep them in step.
function outcomeOf(f: Fee): Outcome {
  const err = f.charge_error || '';
  if (err.startsWith('Disputed by the card holder')) return 'disputed';
  if (err.startsWith('The card holder won a dispute')) return 'dispute_lost';
  if (err.startsWith('The bank returned this payment')) return 'returned';
  if (err.startsWith('No payment method on file')) return 'no_card';
  if (f.status === 'paid') return 'paid';
  if (err) return 'declined';
  return 'pending';
}

const OUTCOMES: Record<Outcome, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  declined: { label: 'Declined', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  no_card: { label: 'No card on file', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  disputed: { label: 'Disputed', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  dispute_lost: { label: 'Dispute lost', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  returned: { label: 'Returned by bank', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  pending: { label: 'Pending', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
};

type Range = 'this_month' | 'last_month' | '90d' | 'all';
const RANGES: { value: Range; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function inRange(iso: string, range: Range): boolean {
  if (range === 'all') return true;
  const t = new Date(iso).getTime();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (range === 'this_month') return t >= startOfMonth;
  if (range === 'last_month') {
    const startOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    return t >= startOfLast && t < startOfMonth;
  }
  return t >= now.getTime() - 90 * 24 * 60 * 60 * 1000;
}

const money = (cents: number | null | undefined) =>
  (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** When this attempt happened: the charge time if there was one, else when it was paid. */
const whenOf = (f: Fee) => f.charge_attempted_at || f.paid_at || f.occurred_at;

export default function AdminTransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<Fee[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [accountFilter, setAccountFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | 'all' | 'problems'>('all');
  const [range, setRange] = useState<Range>('this_month');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';
    if (!email) {
      window.location.href = '/login';
      return;
    }
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();
    if (
      !roleData ||
      roleData.approved !== true ||
      roleData.access_status !== 'Active' ||
      (roleData.role !== 'admin' && roleData.role !== 'demo')
    ) {
      window.location.href = '/admin';
      return;
    }

    // Only fees something actually happened to: a charge was attempted, or it was paid through
    // the processor. Fees still waiting for their first attempt belong to Billing, not here.
    const [{ data: feeRows }, accounts] = await Promise.all([
      supabase
        .from('billing_events')
        .select(
          'id, account_id, job_id, amount_cents, status, occurred_at, paid_at, charge_attempted_at, charge_error, gateway_transaction_id'
        )
        .or('charge_attempted_at.not.is.null,gateway_transaction_id.not.is.null')
        .order('occurred_at', { ascending: false })
        .limit(2000),
      loadAllAccounts<{ id: string; account_name: string | null }>('id, account_name'),
    ]);
    setFees(((feeRows as Fee[]) || []).sort((a, b) => whenOf(b).localeCompare(whenOf(a))));
    setNames(new Map(accounts.map((a) => [a.id, a.account_name || 'Unnamed account'])));
    setLoading(false);
  }

  const accountOptions = useMemo(() => {
    const ids = [...new Set(fees.map((f) => f.account_id))];
    return ids
      .map((id) => ({ id, name: names.get(id) || 'Unknown account' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [fees, names]);

  const rows = useMemo(
    () =>
      fees.filter((f) => {
        if (!inRange(whenOf(f), range)) return false;
        if (accountFilter && f.account_id !== accountFilter) return false;
        const o = outcomeOf(f);
        if (outcomeFilter === 'problems') return o !== 'paid' && o !== 'pending';
        return outcomeFilter === 'all' || o === outcomeFilter;
      }),
    [fees, range, accountFilter, outcomeFilter]
  );

  const totals = useMemo(() => {
    let collected = 0;
    let problems = 0;
    let atRisk = 0;
    for (const f of rows) {
      const o = outcomeOf(f);
      if (o === 'paid') collected += f.amount_cents || 0;
      else if (o !== 'pending') {
        problems += 1;
        atRisk += f.amount_cents || 0;
      }
    }
    return { collected, problems, atRisk };
  }, [rows]);

  if (loading) {
    return <ListPageSkeleton withStats columns={7} rows={8} minWidth={1000} />;
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-brand-700">
          Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Transactions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every attempt to collect a GlasWeld fee: what was charged, to whom, for which job, and
          whether it went through. No Braintree login needed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Collected" value={money(totals.collected)} tone="text-emerald-700" />
        <Stat
          label="Needs attention"
          value={String(totals.problems)}
          tone={totals.problems ? 'text-rose-700' : 'text-slate-900'}
        />
        <Stat label="Not collected" value={money(totals.atRisk)} tone="text-slate-900" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="h-10">
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as Outcome | 'all' | 'problems')}
            className="h-10"
          >
            <option value="all">All outcomes</option>
            <option value="problems">Needs attention</option>
            {(Object.keys(OUTCOMES) as Outcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOMES[o].label}
              </option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="h-10 min-w-[220px]"
          >
            <option value="">All providers</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500">
            {rows.length} transaction{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Braintree ref</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const o = OUTCOMES[outcomeOf(f)];
                return (
                  <tr key={f.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                      {dateTime(whenOf(f))}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/accounts/${f.account_id}`} className="text-brand-700 hover:underline">
                        {names.get(f.account_id) || 'Unknown account'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {f.job_id ? (
                        <Link href={`/jobs/${f.job_id}`} className="text-brand-700 hover:underline">
                          Job {f.job_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums text-slate-900">
                      {money(f.amount_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${o.tone}`}>
                        {o.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {f.gateway_transaction_id || <span className="font-sans text-slate-400">None</span>}
                    </td>
                    <td className="max-w-[360px] px-4 py-3 text-xs text-slate-600">{f.charge_error || ''}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No transactions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
