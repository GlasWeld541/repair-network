import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { cardExpiryState } from '@/lib/card-expiry';
import { recordNotification } from '@/lib/notify';

/**
 * Daily: remind a provider in their Rex bell when the default card GlasWeld charges is about to
 * expire, or has expired (raised on the 9/29 call: an expired card means every later fee fails).
 *
 * Only the default card counts, since that's the one fees are charged to. One reminder per card
 * per state every 30 days, so a provider isn't nagged daily. The event types start with "Payment",
 * so tapping the reminder in the Rex bell opens Billing, where they can add a new card.
 * Runs as a Vercel Cron with the CRON_SECRET bearer; anything else is refused.
 */

const REMIND_EVERY_DAYS = 30;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

type Method = {
  id: string;
  account_id: string;
  card_brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('account_payment_methods')
    .select('id, account_id, card_brand, last4, exp_month, exp_year')
    .eq('status', 'active')
    .eq('is_default', true)
    .eq('method_type', 'card');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const since = new Date(Date.now() - REMIND_EVERY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let reminded = 0;
  let skipped = 0;
  for (const m of (data as Method[]) || []) {
    const state = cardExpiryState(m.exp_month, m.exp_year);
    if (state === 'ok') continue;
    const eventType = state === 'expired' ? 'Payment Card Expired' : 'Payment Card Expiring';

    // Already reminded about this card in this state recently: leave it.
    const { data: recent } = await admin
      .from('notification_events')
      .select('id')
      .eq('account_id', m.account_id)
      .eq('event_type', eventType)
      .gte('created_at', since)
      .contains('metadata', { payment_method_id: m.id })
      .limit(1);
    if (recent && recent.length) {
      skipped += 1;
      continue;
    }

    const card = `${m.card_brand || 'card'} ending ${m.last4 || '????'}`;
    const when = `${String(m.exp_month).padStart(2, '0')}/${String(m.exp_year).slice(-2)}`;
    await recordNotification({
      eventType,
      audience: 'account',
      accountId: m.account_id,
      subject:
        state === 'expired' ? `Your ${card} has expired` : `Your ${card} expires ${when}`,
      body: 'Add a new card in Billing so GlasWeld fees keep going through.',
      metadata: { payment_method_id: m.id, exp: when },
    });
    reminded += 1;
  }
  return NextResponse.json({ reminded, skipped });
}
