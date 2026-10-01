import type { createAdminClient } from '@/lib/supabase';
import { recordNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { buildFeeReceiptEmail } from '@/lib/receipt-email';
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
    .select('id, account_id, job_id, amount_cents, status, gateway_transaction_id')
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
    .select('external_payment_method_id, gateway_customer_id, card_brand, bank_name, last4')
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
    await tellProvider(fee, 'Payment Problem', 'Add a payment method',
      `A GlasWeld fee of ${dollars(fee.amount_cents)} could not be charged because there is no payment method on file. Add one in Billing.`);
    return { kind: 'no_method' };
  }

  const result = await gateway.charge({
    customerId: method.gateway_customer_id,
    token: method.external_payment_method_id,
    amountCents: fee.amount_cents,
    // A fee that is owed yet already carries a transaction id was paid and then reversed; see
    // feeChargeKey for why the retry must not reuse the original key.
    idempotencyKey: feeChargeKey(fee.id, fee.gateway_transaction_id),
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
    const method_label = `${method.card_brand || method.bank_name || 'card'} ending ${method.last4 || '????'}`;
    await tellProvider(fee, 'Payment Charged', `GlasWeld fee of ${dollars(fee.amount_cents)} charged`,
      `Charged to your ${method_label}.`);
    await emailReceipt(admin, fee, method_label, result.transactionId);
    return { kind: 'paid', transactionId: result.transactionId, amountCents: result.amountCents };
  }

  if (!result.retryable) {
    await admin
      .from('billing_events')
      .update({ charge_error: result.message, charge_attempted_at: now })
      .eq('id', fee.id);
    await tellProvider(fee, 'Payment Problem', 'Your GlasWeld fee payment was declined',
      `${result.message} Update your payment method in Billing so it can be charged again.`);
    return { kind: 'declined', message: result.message };
  }
  return { kind: 'retry_later', message: result.message };
}

const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * The provider's own notification (their Rex bell), alongside the admin view. Until now only admins
 * heard about a payment; the provider, the one person who can fix a card, found out only if they
 * happened to open Billing. The event type starts with "Payment" so the Rex bell opens Billing
 * rather than the job. A temporary gateway fault tells nobody: it is retried, not the provider's
 * problem. Best-effort, like every notification: it can never affect the charge itself.
 */
async function tellProvider(
  fee: { account_id: string; job_id: string | null },
  eventType: 'Payment Charged' | 'Payment Problem',
  subject: string,
  body: string,
) {
  await recordNotification({
    eventType,
    audience: 'account',
    accountId: fee.account_id,
    jobId: fee.job_id,
    subject,
    body,
  });
}

/**
 * Email the provider a receipt for a fee that was just charged. Best-effort: a missing email
 * address or a mail hiccup is logged and never affects the charge, which has already happened.
 */
async function emailReceipt(
  admin: AdminClient,
  fee: { account_id: string; job_id: string | null; amount_cents: number },
  methodLabel: string,
  transactionId: string,
) {
  try {
    const { data: account } = await admin
      .from('accounts')
      .select('account_name, company_email')
      .eq('id', fee.account_id)
      .maybeSingle();
    if (!account?.company_email) return;
    let jobLabel: string | null = null;
    if (fee.job_id) {
      const { data: job } = await admin
        .from('jobs')
        .select('vehicle_year, vehicle_make, vehicle_model, damage_type')
        .eq('id', fee.job_id)
        .maybeSingle();
      if (job) {
        const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ');
        jobLabel = [vehicle, job.damage_type].filter(Boolean).join(' · ') || null;
      }
    }
    const { subject, html } = buildFeeReceiptEmail({
      amountCents: fee.amount_cents,
      methodLabel,
      jobLabel,
      transactionId,
      chargedAt: new Date(),
      accountName: account.account_name,
    });
    const sent = await sendEmail({ to: account.company_email, subject, html });
    if (!sent.ok && !sent.skipped) console.warn('chargeFee: receipt email failed', fee.account_id, sent.error);
  } catch (e) {
    console.warn('chargeFee: receipt email threw', e instanceof Error ? e.message : e);
  }
}
