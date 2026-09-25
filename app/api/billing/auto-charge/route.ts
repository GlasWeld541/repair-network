import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getPaymentGateway } from '@/lib/payments';
import { chargeFee } from '@/lib/payments/charge-fee';

type BillingEvent = {
  id: string;
  account_id: string;
  amount_cents: number | null;
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
        message: 'Auto charge is scheduled, but no live payment processor is configured yet.',
      },
      { status: 501 },
    );
  }

  // Each fee is charged on its own through chargeFee, the one place a fee is charged (shared with
  // charge-on-completion and an admin's "Charge now"). Per fee rather than one lump per account, so
  // a part-successful account settles what went through instead of being re-charged next month.
  const tally = { paid: 0, already_paid: 0, declined: 0, no_method: 0, retry_later: 0, not_chargeable: 0 };
  const problems: { accountId: string; kind: string; message: string }[] = [];

  for (const accountId of accountIds) {
    for (const event of groupedEvents[accountId]) {
      const outcome = await chargeFee(admin, gateway, event.id);
      tally[outcome.kind] += 1;
      if (outcome.kind === 'declined' || outcome.kind === 'retry_later') {
        problems.push({ accountId, kind: outcome.kind, message: outcome.message });
      } else if (outcome.kind === 'no_method') {
        problems.push({ accountId, kind: outcome.kind, message: 'No payment method on file.' });
      }
    }
  }

  return NextResponse.json({
    success: tally.declined === 0 && tally.retry_later === 0,
    periodStart,
    periodEnd,
    gateway: gateway.name,
    ...tally,
    problems: problems.slice(0, 20),
  });
}

export async function GET(request: Request) {
  return runAutoCharge(request);
}

export async function POST(request: Request) {
  return runAutoCharge(request);
}
