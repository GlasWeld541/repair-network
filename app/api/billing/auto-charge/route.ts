import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { feeChargeKey, getPaymentGateway } from '@/lib/payments';

type BillingEvent = {
  id: string;
  account_id: string;
  amount_cents: number | null;
};

type PaymentMethod = {
  gateway_customer_id: string | null;
  account_id: string;
  external_payment_method_id: string | null;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorization = request.headers.get('authorization') || '';
  return authorization === `Bearer ${secret}`;
}

function previousMonthRange(now = new Date()) {
  const startOfThisMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const startOfPreviousMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );

  return {
    periodStart: startOfPreviousMonth.toISOString(),
    periodEnd: startOfThisMonth.toISOString(),
  };
}

function groupEventsByAccount(events: BillingEvent[]) {
  return events.reduce<Record<string, BillingEvent[]>>((groups, event) => {
    groups[event.account_id] = groups[event.account_id] || [];
    groups[event.account_id].push(event);
    return groups;
  }, {});
}

async function runAutoCharge(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { periodStart, periodEnd } = previousMonthRange();

  const { data: events, error: eventsError } = await admin
    .from('billing_events')
    .select('id, account_id, amount_cents')
    .eq('status', 'invoiced')
    .gte('occurred_at', periodStart)
    .lt('occurred_at', periodEnd);

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const groupedEvents = groupEventsByAccount((events as BillingEvent[]) || []);
  const accountIds = Object.keys(groupedEvents);

  if (!accountIds.length) {
    return NextResponse.json({
      success: true,
      periodStart,
      periodEnd,
      chargedAccounts: 0,
      skippedAccounts: 0,
      message: 'No invoiced events are ready for auto charge.',
    });
  }

  const { data: methods, error: methodsError } = await admin
    .from('account_payment_methods')
    .select('account_id, external_payment_method_id, gateway_customer_id')
    .in('account_id', accountIds)
    .eq('status', 'active')
    .eq('is_default', true);

  if (methodsError) {
    return NextResponse.json({ error: methodsError.message }, { status: 500 });
  }

  const methodsByAccount = ((methods as PaymentMethod[]) || []).reduce<
    Record<string, PaymentMethod>
  >((summary, method) => {
    summary[method.account_id] = method;
    return summary;
  }, {});

  const gateway = getPaymentGateway();
  if (!gateway) {
    // Not an error: the cron runs on its schedule whether or not a processor is wired, and this
    // is the honest report of that. Fees stay 'invoiced' and an admin collects them by hand.
    return NextResponse.json(
      {
        success: false,
        periodStart,
        periodEnd,
        readyAccountCount: accountIds.length,
        skippedAccounts: accountIds.filter(
          (accountId) => !methodsByAccount[accountId]?.external_payment_method_id
        ).length,
        message:
          'Auto charge is scheduled, but no live payment processor is configured yet.',
      },
      { status: 501 }
    );
  }

  let charged = 0;
  let failed = 0;
  let skipped = 0;
  const problems: { accountId: string; message: string; retryable: boolean }[] = [];

  for (const accountId of accountIds) {
    const method = methodsByAccount[accountId];
    const token = method?.external_payment_method_id;
    const customerId = method?.gateway_customer_id;
    if (!token || !customerId) {
      // No instrument on file. Left 'invoiced' so it shows as outstanding and an admin can chase
      // it; charging is not possible and silently dropping it would hide real money owed.
      skipped += 1;
      continue;
    }

    // Charge each billing event on its own key rather than one lump per account. A part-successful
    // account then settles the events that went through instead of re-charging all of them next
    // month, and the key stays tied to the thing actually being paid for.
    for (const event of groupedEvents[accountId]) {
      // A fee with no amount is a data problem, not something to charge a guessed value for.
      const amountCents = event.amount_cents;
      if (amountCents == null || amountCents <= 0) {
        skipped += 1;
        problems.push({
          accountId,
          message: `Billing event ${event.id} has no chargeable amount.`,
          retryable: false,
        });
        continue;
      }

      const result = await gateway.charge({
        customerId,
        token,
        amountCents,
        idempotencyKey: feeChargeKey(event.id),
        description: 'GlasWeld referral fee',
      });

      if (result.ok) {
        const { error: markError } = await admin
          .from('billing_events')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            gateway_transaction_id: result.transactionId,
            charge_error: null,
          })
          .eq('id', event.id)
          .eq('status', 'invoiced'); // only ever advance an invoiced fee
        if (markError) {
          // The money moved but we failed to record it. Loud, because a retry would double-charge
          // were it not for the idempotency key above.
          console.error('auto-charge: charged but not recorded', event.id, result.transactionId, markError.message);
        }
        charged += 1;
      } else {
        failed += 1;
        problems.push({ accountId, message: result.message, retryable: result.retryable });
        if (!result.retryable) {
          // A decline is a human problem, so leave a trail on the row. A transient error records
          // nothing and simply gets picked up by the next run.
          await admin
            .from('billing_events')
            .update({ charge_error: result.message, charge_attempted_at: new Date().toISOString() })
            .eq('id', event.id);
        }
      }
    }
  }

  return NextResponse.json({
    success: failed === 0,
    periodStart,
    periodEnd,
    gateway: gateway.name,
    charged,
    failed,
    skippedAccounts: skipped,
    problems: problems.slice(0, 20),
  });
}

export async function GET(request: Request) {
  return runAutoCharge(request);
}

export async function POST(request: Request) {
  return runAutoCharge(request);
}
