import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { buildRatingRequestEmail } from '@/lib/rating-email';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Send the customer their satisfaction-rating request (CSI collection, Option A).
 *
 * This is the ONE reusable send action — the trigger is deliberately decoupled from it. Today
 * the job screen calls it when a job is marked Completed (`trigger: 'auto'`) AND from a manual
 * "Request rating" button (`trigger: 'manual'`). To move the trigger later (e.g. to
 * invoice-signed) you only change the call site; this route is unchanged. `CSI_RATING_AUTO_SEND`
 * ('false') disables the automatic send without a deploy while leaving the manual button working.
 *
 * Idempotent: skips if the job is already rated or a request was already sent (unless `force`).
 * Admin-only + service-role, mirroring the accept/PDF routes (anon has no grant on network.jobs).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    let body: { trigger?: 'auto' | 'manual'; force?: boolean } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // empty/invalid body is fine — defaults below
    }
    const trigger = body.trigger === 'manual' ? 'manual' : 'auto';
    const force = body.force === true;

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: { schema: 'network' },
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
        },
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

    // Kill switch for the automatic send (no deploy needed); manual always proceeds.
    if (trigger === 'auto' && process.env.CSI_RATING_AUTO_SEND === 'false') {
      return NextResponse.json({ requested: false, skipped: 'auto_disabled' });
    }

    const admin = createAdminClient();
    const { data: job, error } = await admin
      .from('jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.customer_satisfaction != null) {
      return NextResponse.json({ requested: false, skipped: 'already_rated' });
    }
    if (job.customer_satisfaction_requested_at && !force) {
      return NextResponse.json({ requested: false, skipped: 'already_requested' });
    }
    if (!String(job.customer_email || '').trim()) {
      return NextResponse.json({ requested: false, skipped: 'no_email' });
    }

    // Reuse an existing token if one was already minted for this job; else mint one.
    const token: string = job.customer_satisfaction_token || crypto.randomUUID();

    const { error: updateError } = await admin
      .from('jobs')
      .update({
        customer_satisfaction_token: token,
        customer_satisfaction_requested_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Shop name for context — prefer the denormalized name, fall back to the account row.
    let shopName: string | null = job.assigned_account_name || null;
    if (!shopName && job.assigned_account_id) {
      const { data: account } = await admin
        .from('accounts')
        .select('account_name')
        .eq('id', job.assigned_account_id)
        .maybeSingle();
      shopName = account?.account_name || null;
    }

    const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ');

    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const ratingUrl = `${base.replace(/\/$/, '')}/rate/${token}`;

    const { subject, html } = buildRatingRequestEmail({
      ratingUrl,
      customerName: job.customer_name,
      shopName,
      vehicle: vehicle || null,
    });
    const result = await sendEmail({ to: job.customer_email, subject, html });

    return NextResponse.json({
      requested: result.ok,
      ...(result.ok ? {} : { skipped: 'email_not_sent' }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'request failed' },
      { status: 500 },
    );
  }
}
