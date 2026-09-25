import type { createAdminClient } from '@/lib/supabase';
import { feeChargeKey } from './index';
import type { PaymentGateway } from './types';

/**
 * Charge ONE GlasWeld fee against the provider's card on file.
 *
 * The single place a fee is charged. The monthly run, charge-on-completion for pay-per-job
 * providers, and an admin's "Charge now" all come through here, so they cannot drift apart on the
 * rules that matter:
 *
 *  - The idempotency key is the fee's own id, so however many times a fee is sent here (a re-run,
 *    a double-click, the monthly run catching one that was already charged on completion) it is
 *    charged at most once.
 *  - Only a fee still owed (pending or invoiced) is charged, and the write that marks it paid is
 *    guarded on that too, so a racing second call cannot mark anything twice.
 *  - A decline, and a fee that cannot be charged because there is no card, are written onto the fee
 *    so they show in the admin Payment problems panel. A temporary gateway fault writes nothing and
 *    is simply retried by the next attempt.
 */

export type ChargeFeeOutcome =
  | { kind: 'paid'; transactionId: string; amountCents: number }
  | { kind: 'already_paid' }
  | { kind: 'not_chargeable'; reason: string }
  | { kind: 'no_method' }
  | { kind: 'declined'; message: string }
  | { kind: 'retry_later'; message: string };

const OWED = ['pending', 'invoiced'];
const NO_METHOD = 'No payment method on file, so this fee could not be charged automatically.';

/** The service-role client, bound to the network schema. */
type AdminClient = ReturnType<typeof createAdminClient>;

export async function chargeFee(
  admin: AdminClient,
  gateway: PaymentGateway,
  billingEventId: string,
): Promise<ChargeFeeOutcome> {
  const { data: fee } = await admin
    .from('billing_events')
    .select('id, account_id, amount_cents, status')
    .eq('id', billingEventId)
    .maybeSingle();
  if (!fee) return { kind: 'not_chargeable', reason: 'Fee not found.' };
  if (fee.status === 'paid') return { kind: 'already_paid' };
  if (!OWED.includes(fee.status)) {
    return { kind: 'not_chargeable', reason: `This fee is ${fee.status}, so it is not charged.` };
  }
  // A fee with no amount is a data problem, not something to charge a guessed value for.
  if (fee.amount_cents == null || fee.amount_cents <= 0) {
    return { kind: 'not_chargeable', reason: 'This fee has no amount to charge.' };
  }

  const now = new Date().toISOString();
  const { data: method } = await admin
    .from('account_payment_methods')
    .select('external_payment_method_id, gateway_customer_id')
    .eq('account_id', fee.account_id)
    .eq('status', 'active')
    .eq('is_default', true)
    .maybeSingle();
  // Only a method saved through the processor has a customer id. Rows an admin typed in by hand
  // have none and cannot be charged, which is the point: they were never a real instrument.
  if (!method?.external_payment_method_id || !method.gateway_customer_id) {
    await admin
      .from('billing_events')
      .update({ charge_error: NO_METHOD, charge_attempted_at: now })
      .eq('id', fee.id);
    return { kind: 'no_method' };
  }

  const result = await gateway.charge({
    customerId: method.gateway_customer_id,
    token: method.external_payment_method_id,
    amountCents: fee.amount_cents,
    idempotencyKey: feeChargeKey(fee.id),
    description: 'GlasWeld referral fee',
  });

  if (result.ok) {
    const { error } = await admin
      .from('billing_events')
      .update({
        status: 'paid',
        paid_at: now,
        gateway_transaction_id: result.transactionId,
        charge_error: null,
        charge_attempted_at: now,
      })
      .eq('id', fee.id)
      .in('status', OWED);
    if (error) {
      // The money moved but recording it failed. Loud, because the fee still looks owed; the
      // idempotency key is what stops the next attempt charging it again.
      console.error('chargeFee: charged but not recorded', fee.id, result.transactionId, error.message);
    }
    return { kind: 'paid', transactionId: result.transactionId, amountCents: result.amountCents };
  }

  if (!result.retryable) {
    await admin
      .from('billing_events')
      .update({ charge_error: result.message, charge_attempted_at: now })
      .eq('id', fee.id);
    return { kind: 'declined', message: result.message };
  }
  return { kind: 'retry_later', message: result.message };
}
