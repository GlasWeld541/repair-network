import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { createAdminClient } from '@/lib/supabase';

// GlasWeld's own revenue figures (Derek, 2026-09-15 call): what we earned from referral fees, what
// has been collected, what is still owed and how old it is.
//
// ADMIN ONLY. This is GlasWeld's income, not a provider's — a shop must never see it, so unlike the
// job routes there is no shop branch here. The middleware only proves *a* user is signed in, and
// the aggregation runs on the service-role key (the anon role has no grant on network tables), so
// the role is checked explicitly.
//
// The maths lives in Postgres functions (sql/revenue_reporting.sql) because one fee event is
// written per completed job, so the table grows with claim volume.

export const dynamic = 'force-dynamic';

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {}, // read-only request; nothing to persist
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: roleRow } = await supabase
      .schema('network')
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', user.email.toLowerCase())
      .maybeSingle();

    const active = roleRow?.approved === true && roleRow.access_status === 'Active';
    if (!active || roleRow?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Range: caller-supplied, else this month. `to` is exclusive.
    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const from = fromParam ? new Date(fromParam) : monthStart();
    const to = toParam ? new Date(toParam) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    const months = Math.min(Math.max(Number(url.searchParams.get('months') ?? 12), 1), 36);

    const admin = createAdminClient();
    const p = { p_from: from.toISOString(), p_to: to.toISOString() };

    const [summary, byMonth, aging, byProvider] = await Promise.all([
      admin.rpc('revenue_summary', p),
      admin.rpc('revenue_by_month', { p_months: months }),
      admin.rpc('revenue_aging'),
      admin.rpc('revenue_by_provider', { ...p, p_limit: 50 }),
    ]);

    const failed = [summary, byMonth, aging, byProvider].find((r) => r.error);
    if (failed?.error) {
      // The most likely cause is sql/revenue_reporting.sql not having been applied yet.
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      // rpc() returning a single-row table still comes back as an array.
      summary: Array.isArray(summary.data) ? summary.data[0] : summary.data,
      months: byMonth.data ?? [],
      aging: aging.data ?? [],
      providers: byProvider.data ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load revenue' },
      { status: 500 },
    );
  }
}
