import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { claimNotification } from '@/lib/notify';

/**
 * Daily: nudge providers about jobs they accepted but haven't finished (9/10 call: "we should
 * remind them that they have to complete a job or upload after photos, because it's important for
 * their scoring"). A job finishes when the provider adds the after photo in Rex, which moves it to
 * Submitted, so anything still Accepted or In Progress after a while is waiting on that.
 *
 *  - Provider: a Rex bell reminder (and an email when the account has one) once a job has sat
 *    STALE_HOURS since it was accepted, repeated at most once every STALE_HOURS.
 *  - Admin: one bell alert per job once it has sat ADMIN_AFTER_DAYS, so someone can call them.
 *
 * Every reminder is claimed by a dedupe key first, so an overlapping run (a manual call beside the
 * cron tick, a platform retry) can't send it twice. Runs as a Vercel Cron with the CRON_SECRET
 * bearer; anything else is refused.
 */

const STALE_HOURS = 48;
const ADMIN_AFTER_DAYS = 7;
const OPEN_STATUSES = ['Accepted', 'In Progress'];
const HOUR = 60 * 60 * 1000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

type Job = {
  id: string;
  job_status: string | null;
  accepted_at: string | null;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  customer_city: string | null;
};

function describe(j: Job) {
  const vehicle = [j.vehicle_year, j.vehicle_make, j.vehicle_model].map((v) => (v || '').trim()).filter(Boolean).join(' ');
  return [vehicle || 'Windshield repair', j.customer_city].filter(Boolean).join(', ');
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const now = Date.now();

  const { data, error } = await admin
    .from('jobs')
    .select(
      'id, job_status, accepted_at, assigned_account_id, assigned_account_name, vehicle_year, vehicle_make, vehicle_model, customer_city',
    )
    .in('job_status', OPEN_STATUSES)
    .not('assigned_account_id', 'is', null)
    .not('accepted_at', 'is', null)
    .lte('accepted_at', new Date(now - STALE_HOURS * HOUR).toISOString())
    .order('accepted_at', { ascending: true })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const jobs = (data as Job[]) || [];

  const accountIds = Array.from(new Set(jobs.map((j) => j.assigned_account_id).filter(Boolean))) as string[];
  const emails: Record<string, string | null> = {};
  if (accountIds.length) {
    const { data: accts } = await admin.from('accounts').select('id, company_email').in('id', accountIds);
    for (const a of accts || []) emails[a.id] = a.company_email || null;
  }

  const period = Math.floor(now / (STALE_HOURS * HOUR));
  let provider = 0;
  let emailed = 0;
  let adminAlerts = 0;
  let skipped = 0;

  for (const j of jobs) {
    const days = Math.floor((now - new Date(j.accepted_at as string).getTime()) / (24 * HOUR));
    const what = describe(j);

    const claim = await claimNotification({
      eventType: 'Job Unfinished',
      audience: 'account',
      accountId: j.assigned_account_id,
      jobId: j.id,
      subject: `Finish your job: ${what}`,
      body: `You accepted this job ${days} days ago. Add the after photo in Rex to finish it; your repair score depends on it.`,
      metadata: { days_open: days },
      dedupeKey: `job_unfinished:${j.id}:${period}`,
    });
    if (claim === 'duplicate') {
      skipped += 1;
    } else {
      provider += 1;
      const to = emails[j.assigned_account_id as string];
      if (to) {
        const sent = await sendEmail({
          to,
          subject: `Reminder: finish your GlasWeld job (${what})`,
          html: `<p>Hi ${esc(j.assigned_account_name || 'there')},</p>
<p>You accepted the job <strong>${esc(what)}</strong> ${days} days ago and it isn't finished yet.</p>
<p>Open Rex, finish the repair and add the after photo. That closes the job and gets your repair scored.</p>
<p>If you can't do this job, decline it in Rex so GlasWeld can send it to someone else.</p>
<p>GlasWeld Network</p>`,
        });
        if (sent.ok) emailed += 1;
      }
    }

    if (days >= ADMIN_AFTER_DAYS) {
      const adminClaim = await claimNotification({
        eventType: 'Job Stalled',
        audience: 'admin',
        accountId: j.assigned_account_id,
        jobId: j.id,
        subject: `Job not finished after ${days} days: ${what}`,
        body: `${j.assigned_account_name || 'The provider'} accepted it ${days} days ago and hasn't finished it.`,
        metadata: { days_open: days },
        dedupeKey: `job_stalled_admin:${j.id}`,
      });
      if (adminClaim !== 'duplicate') adminAlerts += 1;
    }
  }

  return NextResponse.json({ checked: jobs.length, provider, emailed, adminAlerts, skipped });
}
