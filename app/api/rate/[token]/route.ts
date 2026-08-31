import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

type RouteContext = {
  params: Promise<{ token: string }>;
};

// Basic UUID shape check so we never run a lookup on obvious junk.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public, unauthenticated satisfaction rating — gated ONLY by the unguessable per-job token in
 * the URL (same trust model as the tokenized invoice/PDF links). GET returns the job context for
 * the page; POST records the 1-5 score (+ optional comment), which fires the existing CSI rollup
 * trigger on network.jobs. Service-role because the anon role has no grant on network.jobs.
 */
async function loadJobByToken(token: string) {
  if (!UUID_RE.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('jobs')
    .select(
      'id, assigned_account_name, vehicle_year, vehicle_make, vehicle_model, customer_satisfaction, customer_satisfaction_requested_at',
    )
    .eq('customer_satisfaction_token', token)
    .maybeSingle();
  return data;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const job = await loadJobByToken(token);
  if (!job) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
  return NextResponse.json({
    shopName: job.assigned_account_name || null,
    vehicle: vehicle || null,
    alreadyRated: job.customer_satisfaction != null,
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    let body: { rating?: number; comment?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // fall through to validation below
    }
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'invalid_rating' }, { status: 400 });
    }
    const comment = String(body.comment || '').trim().slice(0, 1000) || null;

    const job = await loadJobByToken(token);
    if (!job) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (job.customer_satisfaction != null) {
      // Already rated — treat as success so a double-submit shows the thank-you state.
      return NextResponse.json({ ok: true, alreadyRated: true });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('jobs')
      // Writing customer_satisfaction fires network.trg_job_csi → the shop's csi_score updates.
      .update({
        customer_satisfaction: rating,
        customer_satisfaction_at: new Date().toISOString(),
        customer_satisfaction_comment: comment,
      })
      .eq('id', job.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'submit failed' },
      { status: 500 },
    );
  }
}
