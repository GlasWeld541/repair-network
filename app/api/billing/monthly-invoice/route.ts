import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { buildCorporateInvoiceEmail } from '@/lib/matched-email';

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

  // REX-03b: email corporate-invoice accounts their monthly statement (they pay OUTSIDE the
  // system by their agreed terms — this is a statement, not a charge). Group the just-invoiced
  // fees per account, then email each approved corporate account's AP address. Best-effort —
  // an email hiccup never fails the invoice run.
  let corporateEmailed = 0;
  try {
    const byAccount = new Map<string, { cents: number; jobs: number }>();
    for (const ev of data || []) {
      if (!ev.account_id) continue;
      const cur = byAccount.get(ev.account_id) || { cents: 0, jobs: 0 };
      cur.cents += Number(ev.amount_cents || 0);
      cur.jobs += 1;
      byAccount.set(ev.account_id, cur);
    }
    if (byAccount.size) {
      const { data: accts } = await admin
        .from('accounts')
        .select(
          'id, account_name, ap_billing_email, billing_contact_name, billing_profile_type, corporate_invoice_approved',
        )
        .in('id', [...byAccount.keys()]);
      const periodLabel = new Date(periodStart).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      for (const a of accts || []) {
        if (a.billing_profile_type !== 'corporate' || a.corporate_invoice_approved !== true) continue;
        const to = String(a.ap_billing_email || '').trim();
        if (!to) continue;
        const agg = byAccount.get(a.id);
        if (!agg) continue;
        const { subject, html } = buildCorporateInvoiceEmail({
          shopName: a.account_name,
          apContact: a.billing_contact_name,
          periodLabel,
          jobCount: agg.jobs,
          totalCents: agg.cents,
        });
        const res = await sendEmail({ to, subject, html });
        if (res.ok) corporateEmailed += 1;
      }
    }
  } catch {
    // swallow — the invoice status flip already succeeded; emails are best-effort.
  }

  return NextResponse.json({
    success: true,
    periodStart,
    periodEnd,
    invoicedAt,
    eventCount: data?.length || 0,
    totalCents,
    corporateEmailed,
  });
}

export async function GET(request: Request) {
  return runMonthlyInvoice(request);
}

export async function POST(request: Request) {
  return runMonthlyInvoice(request);
}
