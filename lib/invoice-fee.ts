import type { createAdminClient } from '@/lib/supabase';

/**
 * The monthly invoice fee (roadmap v2.11, Shiloh 10/9): $0.35 for each invoice a provider
 * generates in Rex, on any job (referred or their own), added up per month and billed as one fee.
 *
 * Called by the monthly invoice run for the month that just ended. Writes ONE billing event per
 * account ('invoice_fee', amount = count x fee), keyed `invoice_fee:<account>:<YYYY-MM>` so a
 * re-run never bills a month twice. The event is dated the last moment of that month, so the run
 * then marks it invoiced with the other fees and the auto-charge run on the 5th collects it.
 * Only invoices created in Rex count; an invoice GlasWeld staff make on the Network job page is
 * not the provider's.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export const INVOICE_FEE_CENTS = Number(process.env.INVOICE_FEE_CENTS || 35);

export function monthKey(periodStart: string) {
  return periodStart.slice(0, 7); // YYYY-MM
}

export function monthLabel(periodStart: string) {
  return new Date(periodStart).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Rex invoices per account created in [periodStart, periodEnd). */
export async function countRexInvoices(
  admin: AdminClient,
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await admin
      .from('invoices')
      .select('account_id')
      .eq('created_from', 'rex')
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd)
      .order('created_at')
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (row.account_id) counts.set(row.account_id, (counts.get(row.account_id) || 0) + 1);
    }
    if (!data || data.length < page) break;
  }
  return counts;
}

export async function recordMonthlyInvoiceFees(
  admin: AdminClient,
  periodStart: string,
  periodEnd: string,
): Promise<{ accounts: number; invoices: number; cents: number }> {
  const counts = await countRexInvoices(admin, periodStart, periodEnd);
  if (!counts.size || INVOICE_FEE_CENTS <= 0) return { accounts: 0, invoices: 0, cents: 0 };
  const month = monthKey(periodStart);
  const label = monthLabel(periodStart);
  const occurredAt = new Date(new Date(periodEnd).getTime() - 1000).toISOString();
  const rows = [...counts].map(([accountId, n]) => ({
    billing_key: `invoice_fee:${accountId}:${month}`,
    account_id: accountId,
    event_type: 'invoice_fee',
    description: `Rex invoices, ${label}: ${n} x $${(INVOICE_FEE_CENTS / 100).toFixed(2)}`,
    amount_cents: n * INVOICE_FEE_CENTS,
    status: 'pending',
    occurred_at: occurredAt,
    metadata: { month, invoices: n, fee_cents: INVOICE_FEE_CENTS },
  }));
  // ignoreDuplicates: a month already billed keeps its fee (a re-run never charges twice).
  const { error } = await admin
    .from('billing_events')
    .upsert(rows, { onConflict: 'billing_key', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const invoices = [...counts.values()].reduce((a, b) => a + b, 0);
  return { accounts: rows.length, invoices, cents: invoices * INVOICE_FEE_CENTS };
}
