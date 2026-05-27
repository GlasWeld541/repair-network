import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

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

async function runMonthlyInvoice(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { periodStart, periodEnd } = previousMonthRange();
  const invoicedAt = new Date().toISOString();

  const { data, error } = await admin
    .from('billing_events')
    .update({
      status: 'invoiced',
      invoiced_at: invoicedAt,
    })
    .eq('status', 'pending')
    .gte('occurred_at', periodStart)
    .lt('occurred_at', periodEnd)
    .select('id, account_id, amount_cents');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalCents =
    data?.reduce((total, event) => total + Number(event.amount_cents || 0), 0) ||
    0;

  return NextResponse.json({
    success: true,
    periodStart,
    periodEnd,
    invoicedAt,
    eventCount: data?.length || 0,
    totalCents,
  });
}

export async function GET(request: Request) {
  return runMonthlyInvoice(request);
}

export async function POST(request: Request) {
  return runMonthlyInvoice(request);
}
