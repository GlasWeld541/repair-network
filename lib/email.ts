/**
 * Minimal transactional email send, gated behind env so it is inert until configured.
 *
 * Uses Resend (https://resend.com) when RESEND_API_KEY is set — a single HTTPS POST, no
 * SDK. When the key (or the recipient) is missing it is a silent no-op that returns
 * { skipped: true }, so callers can wire notifications now and turn them on later by
 * setting the env vars, without any code change. The provider is intentionally thin here
 * so it can be swapped later (SES/SendGrid/etc.) without touching call sites.
 *
 * Env:
 *   RESEND_API_KEY  — provider key (absent → no-op)
 *   EMAIL_FROM      — verified sender, e.g. "GlasWeld Network <alerts@yourdomain.com>"
 */
type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

type SendResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped?: false; error: string };

export async function sendEmail({ to, subject, html, replyTo }: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'GlasWeld Network <onboarding@resend.dev>';

  const recipients = (Array.isArray(to) ? to : [to])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (!key || recipients.length === 0) {
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}
