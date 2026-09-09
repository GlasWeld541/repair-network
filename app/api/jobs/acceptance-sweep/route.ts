import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { buildReassignNeededEmail } from '@/lib/matched-email';

// REX-01 admin alert sweep. Emails the ops inbox about jobs that need a NEW provider —
// the assigned provider DECLINED, or the 24h acceptance window LAPSED without an accept —
// so an admin knows to reassign. Runs on a Vercel cron; gated by CRON_SECRET (inert until
// set) and INTAKE_NOTIFY_EMAIL (the ops inbox, shared with the intake alert). Best-effort:
// each job is notified once (admin_reassign_notified_at guard), cleared on (re)assignment.

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

const TERMINAL = '("Completed","Canceled")';

function vehicleOf(j: Record<string, unknown>) {
  return [j.vehicle_year, j.vehicle_make, j.vehicle_model]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}
function areaOf(j: Record<string, unknown>) {
  return [j.customer_city, j.customer_state]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(', ');
}
function damageOf(j: Record<string, unknown>) {
  return [j.damage_type, j.damage_notes]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' — ');
}

async function runSweep(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const notifyTo = (process.env.INTAKE_NOTIFY_EMAIL || '').trim();
  if (!notifyTo) {
    return NextResponse.json({ success: true, skipped: 'no INTAKE_NOTIFY_EMAIL', notified: 0 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const cols =
    'id, vehicle_year, vehicle_make, vehicle_model, customer_city, customer_state, ' +
    'damage_type, damage_notes, assigned_account_name';

  // (1) Acceptance window lapsed: still assigned + pending, deadline passed, never accepted.
  const { data: timedOut } = await admin
    .from('jobs')
    .select(cols)
    .eq('acceptance_status', 'pending')
    .is('accepted_at', null)
    .not('assigned_account_id', 'is', null)
    .lt('acceptance_deadline', nowIso)
    .is('admin_reassign_notified_at', null)
    .not('job_status', 'in', TERMINAL);

  // (2) Provider declined: returned to the queue (unassigned, New) but not yet flagged.
  const { data: declined } = await admin
    .from('jobs')
    .select(cols)
    .eq('acceptance_status', 'declined')
    .is('admin_reassign_notified_at', null)
    .not('job_status', 'in', TERMINAL);

  const origin = new URL(request.url).origin;
  const seen = new Set<string>();
  const queue: { job: Record<string, unknown>; reason: 'declined' | 'timeout' }[] = [];
  const declinedRows = (declined || []) as unknown as Record<string, unknown>[];
  const timedOutRows = (timedOut || []) as unknown as Record<string, unknown>[];
  for (const j of declinedRows) {
    if (j.id && !seen.has(String(j.id))) {
      seen.add(String(j.id));
      queue.push({ job: j, reason: 'declined' });
    }
  }
  for (const j of timedOutRows) {
    if (j.id && !seen.has(String(j.id))) {
      seen.add(String(j.id));
      queue.push({ job: j, reason: 'timeout' });
    }
  }

  let notified = 0;
  for (const { job, reason } of queue) {
    const { subject, html } = buildReassignNeededEmail({
      reason,
      priorProvider: (job.assigned_account_name as string) || null,
      vehicle: vehicleOf(job),
      area: areaOf(job),
      damage: damageOf(job),
      jobUrl: `${origin}/jobs/${job.id}`,
    });
    const res = await sendEmail({ to: notifyTo, subject, html });
    if (res.ok) {
      await admin
        .from('jobs')
        .update({ admin_reassign_notified_at: nowIso })
        .eq('id', job.id as string);
      notified += 1;
    }
  }

  return NextResponse.json({
    success: true,
    candidates: queue.length,
    notified,
  });
}

export async function GET(request: Request) {
  return runSweep(request);
}

export async function POST(request: Request) {
  return runSweep(request);
}
