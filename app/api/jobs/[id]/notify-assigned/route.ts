import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { buildJobRequestEmail } from '@/lib/matched-email';
import { billingBlocksRouting } from '@/lib/billing';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * REX-01 — notify the assigned provider of a new JOB REQUEST (fired on assign, before
 * acceptance). Sends the urgency email with the customer HIDDEN (vehicle/area/damage only);
 * the provider self-accepts in Rex, which reveals the customer + emails them. Admin-only,
 * best-effort — a skipped/failed email never blocks the assignment.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: { schema: 'network' },
        cookies: { get: (name) => cookieStore.get(name)?.value },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', user.email.toLowerCase())
      .maybeSingle();
    const active = roleData?.approved === true && roleData.access_status === 'Active';
    if (!active || roleData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: job, error } = await admin.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (!job.assigned_account_id) {
      return NextResponse.json({ error: 'Job has no assigned provider.' }, { status: 400 });
    }

    const { data: account } = await admin
      .from('accounts')
      // Keep this on ONE line: Supabase infers the row type from the select string as a
      // literal, and concatenation widens it to `string` (every field becomes an error).
      // eslint-disable-next-line prettier/prettier
      .select('account_name, company_email, billing_profile_type, billing_enabled, corporate_invoice_approved, billing_past_due')
      .eq('id', job.assigned_account_id)
      .maybeSingle();
    if (!account?.company_email) {
      return NextResponse.json({ emailed: false, reason: 'no provider email' });
    }
    // REX-14 — don't invite a provider to a job they can't be billed for. The same gate
    // already filters the picker; enforcing it here too means an un-onboarded shop never
    // even learns the job exists (they'd be blocked at accept anyway). Advisory while
    // NEXT_PUBLIC_BILLING_GATE_ENFORCED is off, so beta routing is unaffected.
    if (billingBlocksRouting(account)) {
      return NextResponse.json({ emailed: false, reason: 'provider not billing-ready' });
    }

    const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ');
    // General area only — never the full address (customer identity stays hidden).
    const area = [job.customer_city, job.customer_state]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(', ');
    const damage = [job.damage_type, job.damage_notes]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' — ');

    const { subject, html } = buildJobRequestEmail({
      shopName: account.account_name || job.assigned_account_name,
      vehicle,
      area,
      damage,
      serviceType: job.service_type,
    });
    const result = await sendEmail({ to: account.company_email, subject, html });
    return NextResponse.json({ emailed: !!result.ok });
  } catch {
    // Never block the assignment on a notification failure.
    return NextResponse.json({ emailed: false }, { status: 200 });
  }
}
