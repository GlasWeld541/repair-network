'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useConfirm, useToast } from '@/components/ui/notifications';

/**
 * Fees whose payment failed, and why.
 *
 * The charge run records a decline on the fee itself, and the Braintree webhook records a bank
 * return or a dispute the same way. Until now nothing displayed those, so a failed payment only
 * existed as a column nobody looked at. This lists them, newest first, with what happened, who
 * owes it, and whether they have a card on file to try again with.
 *
 * It loads its own data on purpose. The columns it reads arrive with sql/payment_gateway_vault.sql;
 * if that has not been applied yet the query fails, and this renders nothing rather than breaking
 * the rest of the billing page.
 */

type Problem = {
  id: string;
  account_id: string;
  job_id: string | null;
  amount_cents: number | null;
  status: string;
  charge_error: string;
  charge_attempted_at: string | null;
  occurred_at: string;
};

type Kind = { label: string; tone: string };

// The wording comes from the charge run and the webhook (lib/payments/webhook.ts), so the start of
// the message identifies what happened.
function classify(error: string): Kind {
  if (error.startsWith('The bank returned')) return { label: 'Returned by bank', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
  if (error.startsWith('The card holder won')) return { label: 'Dispute lost', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
  if (error.startsWith('Disputed by the card holder')) return { label: 'Disputed', tone: 'bg-amber-50 text-amber-800 ring-amber-200' };
  return { label: 'Declined', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
}

const money = (cents: number | null) =>
  cents == null ? '—' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function PaymentProblems({ readOnly }: { readOnly: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [available, setAvailable] = useState(false);
  const [rows, setRows] = useState<Problem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [cards, setCards] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('billing_events')
      .select('id, account_id, job_id, amount_cents, status, charge_error, charge_attempted_at, occurred_at')
      .not('charge_error', 'is', null)
      .order('charge_attempted_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) {
      // Most likely the charge-audit columns are not applied yet. Stay out of the way.
      setAvailable(false);
      return;
    }
    const problems = (data || []) as Problem[];
    setRows(problems);
    setAvailable(true);

    const ids = [...new Set(problems.map((p) => p.account_id))];
    if (!ids.length) return;
    const [{ data: accts }, { data: methods }] = await Promise.all([
      supabase.from('accounts').select('id, account_name').in('id', ids),
      supabase
        .from('account_payment_methods')
        .select('account_id, card_brand, bank_name, last4')
        .in('account_id', ids)
        .eq('status', 'active')
        .eq('is_default', true),
    ]);
    setNames(Object.fromEntries((accts || []).map((a) => [a.id, a.account_name || 'Unnamed account'])));
    setCards(
      Object.fromEntries(
        (methods || []).map((m) => [
          m.account_id,
          `${m.card_brand || m.bank_name || 'Card'} •••• ${m.last4 || '????'}`,
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Retry a fee now, e.g. after the provider has updated their card. Goes through the same charge
  // path as the monthly run, so it can never charge a fee twice.
  async function chargeNow(p: Problem) {
    setBusy(p.id);
    try {
      const res = await fetch('/api/billing/charge-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingEventId: p.id, trigger: 'manual' }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(out.error || 'Could not charge that fee.');
      else if (out.kind === 'paid') toast.success(`Charged ${money(out.amountCents)}.`);
      else if (out.kind === 'already_paid') toast.info('That fee was already paid.');
      else if (out.kind === 'no_method') toast.error('Still no card on file for this provider.');
      else if (out.kind === 'declined') toast.error(`Declined again: ${out.message}`);
      else if (out.kind === 'retry_later') toast.info(`The processor could not be reached: ${out.message}`);
      else if (out.kind === 'not_chargeable') toast.info(out.reason);
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function dismiss(p: Problem) {
    const ok = await confirm({
      title: 'Clear this payment problem?',
      message:
        'This only removes it from this list. It does not mark the fee paid. If you collected the money another way, mark the fee paid in Usage Events below.',
      confirmLabel: 'Clear',
    });
    if (!ok) return;
    setBusy(p.id);
    const { error } = await supabase.from('billing_events').update({ charge_error: null }).eq('id', p.id);
    setBusy(null);
    if (error) {
      toast.error(`Could not clear it: ${error.message}`);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== p.id));
    toast.success('Cleared.');
  }

  if (!available) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Payment problems</h2>
          <p className="text-sm text-slate-500">
            Fees whose payment was declined, returned by the bank, or disputed.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            rows.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {rows.length ? `${rows.length} need attention` : 'None'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No failed payments. Declines, bank returns and disputes will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">What happened</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Card on file</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const kind = classify(p.charge_error);
                return (
                  <tr key={p.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-3">
                      <Link href={`/accounts/${p.account_id}`} className="font-medium text-brand-700 hover:underline">
                        {names[p.account_id] || 'Account'}
                      </Link>
                      {p.job_id ? (
                        <div className="mt-0.5">
                          <Link href={`/jobs/${p.job_id}`} className="text-xs text-slate-500 hover:underline">
                            View job
                          </Link>
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-md px-3 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${kind.tone}`}>
                        {kind.label}
                      </span>
                      <div className="mt-1 text-xs leading-relaxed text-slate-600">{p.charge_error}</div>
                    </td>
                    <td className="px-3 py-3 font-medium tabular-nums text-slate-900">{money(p.amount_cents)}</td>
                    <td className="px-3 py-3 text-slate-600">{when(p.charge_attempted_at || p.occurred_at)}</td>
                    <td className="px-3 py-3">
                      {cards[p.account_id] ? (
                        <span className="text-slate-700">{cards[p.account_id]}</span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-700">None on file</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!readOnly ? (
                        <div className="flex justify-end gap-1">
                          {p.status !== 'paid' ? (
                            <button
                              type="button"
                              onClick={() => void chargeNow(p)}
                              disabled={busy === p.id}
                              className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              {busy === p.id ? 'Charging…' : 'Charge now'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void dismiss(p)}
                            disabled={busy === p.id}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
