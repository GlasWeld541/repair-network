import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { recordNotification } from '@/lib/notify';
import {
  InvalidWebhookSignature,
  braintreeConfigured,
  parseBraintreeWebhook,
} from '@/lib/payments/braintree';
import { planWebhook } from '@/lib/payments/webhook';

/**
 * Braintree webhook receiver.
 *
 * Public on purpose (listed in middleware.ts): Braintree cannot log in. What protects it is the
 * signature check in parseBraintreeWebhook, so an unsigned or altered request gets a 403 and changes
 * nothing.
 *
 * Braintree retries anything that is not a 2xx, so a VERIFIED notification always gets a 200, even
 * when it concerns a transaction we do not recognise. Otherwise one unrelated event would be
 * re-sent to us indefinitely.
 */
export async function POST(request: Request) {
  if (!braintreeConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  }

  let signature = '';
  let payload = '';
  try {
    const form = await request.formData();
    signature = String(form.get('bt_signature') || '');
    payload = String(form.get('bt_payload') || '');
  } catch {
    return NextResponse.json({ error: 'Expected a form-encoded Braintree notification.' }, { status: 400 });
  }
  if (!signature || !payload) {
    return NextResponse.json({ error: 'Missing bt_signature or bt_payload.' }, { status: 400 });
  }

  let event;
  try {
    event = await parseBraintreeWebhook(signature, payload);
  } catch (e) {
    if (e instanceof InvalidWebhookSignature) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
    }
    // Could not reach Braintree to verify. A 5xx makes Braintree retry later, which is what we want.
    return NextResponse.json({ error: 'Could not verify the notification.' }, { status: 502 });
  }

  const admin = createAdminClient();
  let outcome = 'no matching fee';

  if (event.transactionId) {
    const { data: fee } = await admin
      .from('billing_events')
      .select('id, job_id, status, charge_error')
      .eq('gateway_transaction_id', event.transactionId)
      .maybeSingle();

    if (fee) {
      const plan = planWebhook(
        event.kind,
        { status: fee.status, charge_error: fee.charge_error },
        { disputeReason: event.disputeReason },
      );
      outcome = 'no change';
      if (plan.update) {
        let write = admin.from('billing_events').update(plan.update).eq('id', fee.id);
        // Reverting a paid fee is guarded in the database too, so two deliveries racing each
        // other cannot both revert it or both raise an alert.
        if (plan.requirePaid) write = write.eq('status', 'paid');
        const { data: changed, error } = await write.select('id');
        if (error) {
          console.error('payments webhook: fee update failed', fee.id, error.message);
          outcome = 'update failed';
        } else if (changed?.length) {
          outcome = 'updated';
          if (plan.alert) {
            await recordNotification({
              eventType: 'Payment Problem',
              audience: 'admin',
              subject: plan.alert.subject,
              body: plan.alert.body,
              jobId: fee.job_id ?? null,
              metadata: { kind: event.kind, transaction_id: event.transactionId },
            });
          }
        }
      }
    }
  }

  // Audit trail of every verified notification. Best-effort: never fail the webhook over it.
  const { error: logError } = await admin.from('payment_webhook_events').insert({
    kind: event.kind,
    transaction_id: event.transactionId,
    outcome,
  });
  if (logError) console.warn('payments webhook: log insert failed', logError.message);

  return NextResponse.json({ received: true, kind: event.kind, outcome });
}
