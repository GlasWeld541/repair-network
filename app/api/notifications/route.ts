import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';

/**
 * The notification centre's feed (see sql/notification_center.sql).
 *
 * GET  — the caller's notifications, newest first, each flagged read/unread for THEM.
 * POST — mark notifications read ({ ids: [...] } or { all: true }).
 *
 * Audience is resolved from the caller's own role, never from the request: an admin sees the
 * 'admin' feed, a shop sees only its own account's rows. Service-role client because the anon
 * key has no grant on network.* (see the repair-network CLAUDE.md), so this route authorizes
 * explicitly rather than leaning on RLS.
 */

const PAGE = 50;

type Caller = { email: string; role: string; accountId: string | null };

async function resolveCaller(): Promise<Caller | null> {
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
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, approved, access_status, account_id')
    .eq('user_email', email)
    .maybeSingle();
  if (!roleData || roleData.approved !== true || roleData.access_status !== 'Active') return null;
  return { email, role: roleData.role, accountId: roleData.account_id ?? null };
}

export async function GET() {
  const caller = await resolveCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  let query = admin
    .from('notification_events')
    .select('id, event_type, audience, subject, body, job_id, account_id, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE);

  if (caller.role === 'admin') {
    query = query.eq('audience', 'admin');
  } else if (caller.accountId) {
    query = query.eq('audience', 'account').eq('account_id', caller.accountId);
  } else {
    // A role with nothing addressed to it: an empty feed, not an error.
    return NextResponse.json({ notifications: [], unread: 0 });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = data || [];

  // Read state is per person, so one admin reading a notification leaves it unread for the rest.
  const { data: reads } = await admin
    .from('notification_reads')
    .select('notification_id')
    .eq('user_email', caller.email)
    .in(
      'notification_id',
      rows.map((r) => r.id),
    );
  const readIds = new Set((reads || []).map((r) => r.notification_id));

  const notifications = rows.map((r) => ({ ...r, read: readIds.has(r.id) }));
  return NextResponse.json({
    notifications,
    unread: notifications.filter((n) => !n.read).length,
  });
}

export async function POST(request: Request) {
  const caller = await resolveCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  const admin = createAdminClient();

  let ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === 'string') : [];
  if (body.all) {
    // Re-resolve the caller's own feed rather than trusting a client-supplied list, so marking
    // "all" can never mark someone else's notification read.
    let q = admin.from('notification_events').select('id').limit(500);
    q =
      caller.role === 'admin'
        ? q.eq('audience', 'admin')
        : q.eq('audience', 'account').eq('account_id', caller.accountId || '');
    const { data } = await q;
    ids = (data || []).map((r) => r.id as string);
  }
  if (!ids.length) return NextResponse.json({ marked: 0 });

  const { error } = await admin.from('notification_reads').upsert(
    ids.map((id) => ({ notification_id: id, user_email: caller.email })),
    { onConflict: 'notification_id,user_email' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ marked: ids.length });
}
