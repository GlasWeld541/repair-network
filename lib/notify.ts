import { createAdminClient } from '@/lib/supabase';

/**
 * Record an in-app notification alongside an email (see sql/notification_center.sql).
 *
 * Every notification email now also leaves a row in network.notification_events, so an admin or
 * provider who misses the email can still catch up inside the app.
 *
 * Best-effort on purpose: a notification must never break the thing it is reporting on. A failed
 * insert is logged and swallowed, exactly like the email sends it sits beside.
 *
 * Written with the service key because the rows are audience-scoped by RLS on read, and some
 * callers (the acceptance sweep) run as a cron with no user session at all.
 */
export type NotifyArgs = {
  eventType: string;
  /** 'admin' = the GlasWeld team, 'account' = one provider, 'customer' = log only (no in-app view) */
  audience: 'admin' | 'account' | 'customer';
  subject: string;
  body?: string;
  jobId?: string | null;
  accountId?: string | null;
  recipientEmail?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordNotification(args: NotifyArgs): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('notification_events').insert({
      event_type: args.eventType,
      audience: args.audience,
      subject: args.subject,
      body: args.body ?? null,
      job_id: args.jobId ?? null,
      account_id: args.accountId ?? null,
      recipient_email: args.recipientEmail ?? null,
      // 'sent' because the email went out in the same breath; the row is the record of it, not a
      // queue item waiting to be delivered.
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: args.metadata ?? {},
    });
    if (error) console.warn('notification insert failed', error.message);
  } catch (e) {
    console.warn('notification insert threw', e instanceof Error ? e.message : e);
  }
}
