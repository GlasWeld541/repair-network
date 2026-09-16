'use client';

import { useCallback, useEffect, useState } from 'react';

// GlasWeld's own money (Derek, 2026-09-15 call). The jobs ledger answers "what did this shop bill
// its customer"; this answers "what did GlasWeld earn, what has been collected, what is still owed
// and how old is it" — the reconciliation view that didn't exist.
//
// All aggregation happens in Postgres (sql/revenue_reporting.sql) behind an admin-only route, so
// this component only formats what it is handed.

type Summary = {
  earned_cents: number;
  collected_cents: number;
  waived_cents: number;
  outstanding_cents: number;
  earned_events: number;
  outstanding_events: number;
};
type MonthRow = { month: string; earned_cents: number; collected_cents: number };
type AgingRow = { bucket: string; amount_cents: number; events: number };
type ProviderRow = {
  account_id: string;
  account_name: string;
  billing_profile: string | null;
  jobs: number;
  earned_cents: number;
  collected_cents: number;
  outstanding_cents: number;
};
type Payload = {
  summary: Summary | null;
  months: MonthRow[];
  aging: AgingRow[];
  providers: ProviderRow[];
};

const money = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const startOfYear = () => new Date(new Date().getFullYear(), 0, 1);
const iso = (d: Date) => d.toISOString().slice(0, 10);

type RangeKey = 'month' | 'ytd' | 'custom';

export default function GlasWeldRevenue() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [from, setFrom] = useState(iso(startOfMonth()));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const pickRange = (key: RangeKey) => {
    setRangeKey(key);
    if (key === 'month') {
      setFrom(iso(startOfMonth()));
      setTo(iso(new Date()));
    } else if (key === 'ytd') {
      setFrom(iso(startOfYear()));
      setTo(iso(new Date()));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `to` is exclusive in the query, so send the day after the chosen end date to include it.
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      const res = await fetch(
        `/api/admin/revenue?from=${new Date(from).toISOString()}&to=${end.toISOString()}`,
        { cache: 'no-store' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load revenue');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data?.summary;
  const monthLabel = (m: string) =>
    new Date(`${m}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">GlasWeld Revenue</h2>
          <p className="mt-1 text-sm text-slate-500">
            What GlasWeld earned from referral fees, what has been collected, and what is still owed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['month', 'This month'],
              ['ytd', 'Year to date'],
              ['custom', 'Custom'],
            ] as [RangeKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => pickRange(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                rangeKey === key
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
          {rangeKey === 'custom' ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
              />
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
          <button onClick={() => void load()} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="py-6 text-sm text-slate-500">Loading revenue…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Earned in range" value={money(s?.earned_cents)} tone="brand" note={`${s?.earned_events ?? 0} jobs`} />
            <Stat label="Collected in range" value={money(s?.collected_cents)} tone="green" />
            <Stat
              label="Owed to us"
              value={money(s?.outstanding_cents)}
              tone="amber"
              note={`${s?.outstanding_events ?? 0} unpaid`}
            />
            <Stat label="Waived" value={money(s?.waived_cents)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Month by month</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2">Month</th>
                    <th className="py-2 text-right">Earned</th>
                    <th className="py-2 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {(data?.months ?? []).map((m) => (
                    <tr key={m.month} className="border-b border-slate-100">
                      <td className="py-1.5 text-slate-700">{monthLabel(m.month)}</td>
                      <td className="py-1.5 text-right text-slate-900">{money(m.earned_cents)}</td>
                      <td className="py-1.5 text-right text-slate-500">{money(m.collected_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Owed to us, by age</h3>
              <p className="mb-2 text-xs text-slate-500">
                Counted from the invoice date, so an unpaid invoice moves to the next bucket as the
                month turns.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2">Age</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Items</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {(data?.aging ?? []).map((a) => (
                    <tr key={a.bucket} className="border-b border-slate-100">
                      <td className="py-1.5 text-slate-700">{a.bucket} days</td>
                      <td
                        className={`py-1.5 text-right ${
                          a.bucket === '90+' && a.amount_cents > 0
                            ? 'font-semibold text-rose-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {money(a.amount_cents)}
                      </td>
                      <td className="py-1.5 text-right text-slate-500">{a.events}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">By provider</h3>
            {(data?.providers ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No fees in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2">Provider</th>
                      <th className="py-2">Billing</th>
                      <th className="py-2 text-right">Jobs</th>
                      <th className="py-2 text-right">Earned</th>
                      <th className="py-2 text-right">Collected</th>
                      <th className="py-2 text-right">Owed</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {(data?.providers ?? []).map((p) => (
                      <tr key={p.account_id} className="border-b border-slate-100">
                        <td className="py-1.5">
                          <a href={`/accounts/${p.account_id}`} className="text-brand-700 hover:underline">
                            {p.account_name}
                          </a>
                        </td>
                        <td className="py-1.5 text-slate-500">{p.billing_profile ?? 'Not set up'}</td>
                        <td className="py-1.5 text-right text-slate-700">{p.jobs}</td>
                        <td className="py-1.5 text-right text-slate-900">{money(p.earned_cents)}</td>
                        <td className="py-1.5 text-right text-slate-500">{money(p.collected_cents)}</td>
                        <td
                          className={`py-1.5 text-right ${
                            p.outstanding_cents > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {money(p.outstanding_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'green' | 'amber';
  note?: string;
}) {
  const color =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'brand'
          ? 'text-brand-700'
          : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>{value}</div>
      {note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}
