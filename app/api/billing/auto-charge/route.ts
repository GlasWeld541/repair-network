import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

type BillingEvent = {
  id: string;
  account_id: string;
  amount_cents: number | null;
};

type PaymentMethod = {
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
    .select('account_id, external_payment_method_id')
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

  const processorConfigured =
    process.env.PAYMENT_PROCESSOR_ENABLED === 'true' &&
    Boolean(process.env.PAYMENT_PROCESSOR_PROVIDER);

  if (!processorConfigured) {
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

  return NextResponse.json(
    {
      success: false,
      periodStart,
      periodEnd,
      readyAccountCount: accountIds.length,
      message:
        'Payment processor credentials are present, but the processor charge adapter still needs to be implemented.',
    },
    { status: 501 }
  );
}

export async function GET(request: Request) {
  return runAutoCharge(request);
}

export async function POST(request: Request) {
  return runAutoCharge(request);
}
