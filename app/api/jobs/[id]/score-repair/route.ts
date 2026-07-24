import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';

// Rex backend that owns the scoring engine (POST /public/score-repair). Overridable if it moves.
const REX_BACKEND_URL = (
  process.env.REX_BACKEND_URL || 'https://backend-production-ad25.up.railway.app'
).replace(/\/$/, '');

// Score a customer job's before/after repair photos with Rex's engine and store the result
// on the job (pending admin review) — the customer-linked analogue of field-tech scoring.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status, account_id')
      .eq('user_email', user.email.toLowerCase())
      .maybeSingle();

    const active = roleData?.approved === true && roleData.access_status === 'Active';
    if (!active || (roleData?.role !== 'admin' && roleData?.role !== 'shop')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const secret = process.env.SCORE_REPAIR_SHARED_SECRET || '';
    if (!secret) {
      return NextResponse.json(
        { error: 'Rex scoring is not configured yet (missing shared secret).' },
        { status: 503 }
      );
    }

    const admin = createAdminClient();

    const { data: job } = await admin
      .from('jobs')
      .select('assigned_account_id, damage_type, damage_notes, service_type')
      .eq('id', id)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    // A shop may only score its own job.
    if (roleData?.role === 'shop' && job.assigned_account_id !== roleData.account_id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { data: photoRows } = await admin
      .from('job_photos')
      .select('type, url')
      .eq('job_id', id);

    const befores = (photoRows || []).filter((p) => p.type === 'before');
    const afters = (photoRows || []).filter((p) => p.type === 'after');
    const beforeUrl = befores.length ? befores[befores.length - 1].url : null;
    const afterUrl = afters.length ? afters[afters.length - 1].url : null;

    if (!beforeUrl || !afterUrl) {
      return NextResponse.json(
        { error: 'A before and after photo are both required to score.' },
        { status: 422 }
      );
    }

    const context = [
      job.damage_type ? `damage=${job.damage_type}` : '',
      job.service_type ? `service=${job.service_type}` : '',
      job.damage_notes || '',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500);

    let scored: {
      score: number;
      why: string;
      strengths?: string[];
      issues?: string[];
      usable?: boolean;
    };

    try {
      const res = await fetch(`${REX_BACKEND_URL}/public/score-repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Secret': secret },
        body: JSON.stringify({ before_url: beforeUrl, after_url: afterUrl, context }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Scoring failed (${res.status}).` },
          { status: 502 }
        );
      }
      scored = await res.json();
    } catch {
      return NextResponse.json(
        { error: 'Could not reach the scoring service.' },
        { status: 502 }
      );
    }

    const detail = {
      strengths: Array.isArray(scored.strengths) ? scored.strengths : [],
      issues: Array.isArray(scored.issues) ? scored.issues : [],
      usable: scored.usable !== false,
    };

    const { error: updateError } = await admin
      .from('jobs')
      .update({
        repair_score: scored.score,
        repair_score_why: scored.why,
        repair_score_detail: detail,
        repair_score_status: 'pending',
        repair_scored_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      score: scored.score,
      why: scored.why,
      detail,
      status: 'pending',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scoring error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
