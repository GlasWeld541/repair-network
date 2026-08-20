import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { buildMatchedEmail } from '@/lib/matched-email';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Admin-confirmed acceptance checkpoint (#189, option B). The admin marks that the assigned
 * shop has accepted the job; that stamps `accepted_at` and — once, idempotently — sends the
 * customer the "you've been matched" email (the vendor is never exposed to the customer
 * before this point). Mirrors the job PDF route's auth: identify the caller from their
 * session, require an active admin, then read/write via the service-role client (the anon
 * role has no grant on network.jobs).
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

    const admin = createAdminClient();

    const { data: job, error } = await admin
      .from('jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (!job.assigned_account_id) {
      return NextResponse.json(
        { error: 'Assign a shop before confirming acceptance.' },
        { status: 400 },
      );
    }
    if (job.job_status === 'Completed' || job.job_status === 'Canceled') {
      return NextResponse.json(
        { error: `A ${String(job.job_status).toLowerCase()} job can't be accepted.` },
        { status: 400 },
      );
    }

    // Stamp acceptance (idempotent — keep the first accepted_at).
    const acceptedAt = job.accepted_at || new Date().toISOString();
    if (!job.accepted_at) {
      await admin.from('jobs').update({ accepted_at: acceptedAt }).eq('id', id);
    }

    // Send the customer their match — exactly once (guarded by matched_email_sent_at).
    let emailed = false;
    let emailSkipped = false;
    if (!job.matched_email_sent_at && job.customer_email) {
      // Enrich with the shop's location + certification + rolled-up Rex score.
      const { data: account } = await admin
        .from('accounts')
        .select('account_name, city, state, glasweld_certified')
        .eq('id', job.assigned_account_id)
        .maybeSingle();

      let score: number | null = null;
      const { data: scored } = await admin
        .from('jobs')
        .select('repair_score')
        .eq('assigned_account_id', job.assigned_account_id)
        .eq('repair_score_status', 'approved')
        .not('repair_score', 'is', null);
      if (scored && scored.length) {
        const sum = scored.reduce((a, r) => a + Number(r.repair_score || 0), 0);
        score = sum / scored.length;
      }

      const { subject, html } = buildMatchedEmail({
        customerName: job.customer_name,
        shopName: account?.account_name || job.assigned_account_name,
        shopCity: account?.city,
        shopState: account?.state,
        certified: account?.glasweld_certified === 'Yes',
        score,
      });

      const result = await sendEmail({ to: job.customer_email, subject, html });
      if (result.ok) {
        emailed = true;
        await admin
          .from('jobs')
          .update({ matched_email_sent_at: new Date().toISOString() })
          .eq('id', id);
      } else {
        // Resend not configured (skipped) or a transient error — acceptance still stands;
        // the email can be retried by confirming again (matched_email_sent_at stays null).
        emailSkipped = true;
      }
    }

    return NextResponse.json({
      ok: true,
      accepted_at: acceptedAt,
      emailed,
      email_skipped: emailSkipped,
      already_sent: Boolean(job.matched_email_sent_at),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'accept failed' },
      { status: 500 },
    );
  }
}
