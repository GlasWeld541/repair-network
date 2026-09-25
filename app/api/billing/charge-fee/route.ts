import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { getPaymentGateway } from '@/lib/payments';
import { chargeFee } from '@/lib/payments/charge-fee';

/**
 * Charge one fee now. Two callers:
 *
 *  - trigger "completion": fired by the job screen the moment a job is marked Completed. Charges
 *    ONLY a pay-per-job provider, per the billing ticket: small shops are charged on demand when the
 *    job completes, because GlasWeld is a referral source with no collections department. Monthly
 *    and corporate accounts are left for the monthly run, so this returns "skipped" for them.
 *  - trigger "manual": an admin's "Charge now", e.g. retrying a declined fee after the provider
 *    updated their card. Charges whatever the billing profile.
 *
 * Either way the fee goes through chargeFee, the single place a fee is charged, so it can never be
 * charged twice however many times it is sent here. Admin-only: every fee-changing action in the
 * Network is.
 */
type Body = { billingEventId?: string; jobId?: string; trigger?: 'completion' | 'manual' };

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'network' }, cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: role } = await supabase
    .from('user_roles')
    .select('role, approved, access_status')
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();
  if (!(role?.approved === true && role.access_status === 'Active' && role.role === 'admin')) {
    return NextResponse.json({ error: 'Only an admin can charge a fee.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const trigger = body.trigger === 'manual' ? 'manual' : 'completion';

  const gateway = getPaymentGateway();
  if (!gateway) {
    // On completion this is the normal state until billing is switched on, so it is quiet.
    return trigger === 'manual'
      ? NextResponse.json({ error: 'Payments are not switched on yet.' }, { status: 503 })
      : NextResponse.json({ skipped: 'processor_off' });
  }

  const admin = createAdminClient();
  let feeId = body.billingEventId || null;
  if (!feeId && body.jobId) {
    // The completion fee's key is fixed per job (see recordCompletedJobBillingEvent).
    const { data } = await admin
      .from('billing_events')
      .select('id')
      .eq('billing_key', `platform_revenue_share:${body.jobId}`)
      .maybeSingle();
    feeId = data?.id ?? null;
  }
  if (!feeId) {
    // No fee on completion is normal (e.g. a $0 job records none). Nothing to charge.
    return trigger === 'manual'
      ? NextResponse.json({ error: 'That fee was not found.' }, { status: 404 })
      : NextResponse.json({ skipped: 'no_fee' });
  }

  if (trigger === 'completion') {
    const { data: fee } = await admin.from('billing_events').select('account_id').eq('id', feeId).maybeSingle();
    const { data: account } = fee
      ? await admin.from('accounts').select('billing_profile_type').eq('id', fee.account_id).maybeSingle()
      : { data: null };
    if (account?.billing_profile_type !== 'pay_per_job') {
      return NextResponse.json({ skipped: 'not_pay_per_job' });
    }
  }

  const outcome = await chargeFee(admin, gateway, feeId);
  return NextResponse.json({ trigger, ...outcome });
}
