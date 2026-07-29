# New-intake email notifications

When a new customer/agent lead lands in the Repair Network (`POST /api/consumer-intake`),
the app can email an admin/queue-owner a summary of the lead with a link to the triage
queue. **The mechanism is built and deployed but stays inert until the env vars below are
set** — no code change is needed to turn it on.

## Turn it on (repair-network Vercel project → Settings → Environment Variables)

| Var | Required | What |
|---|---|---|
| `INTAKE_NOTIFY_EMAIL` | yes | Recipient(s) — Derek's dedicated group address. Comma-separate for several (`ops@…,derek@…`). |
| `RESEND_API_KEY` | yes | Provider key from [resend.com](https://resend.com). Create an account and **verify a sending domain**. |
| `EMAIL_FROM` | recommended | Verified sender, e.g. `GlasWeld Network <alerts@yourdomain.com>`. Defaults to Resend's sandbox `onboarding@resend.dev` (test-only, delivers to the account owner). |
| `NEXT_PUBLIC_APP_URL` | optional | Base URL for the "Open the intake queue" button. Defaults to `https://repair-network.vercel.app`. |

With `RESEND_API_KEY` **or** `INTAKE_NOTIFY_EMAIL` missing, the send is a silent no-op — the
intake always succeeds regardless. A send failure is swallowed and never affects the intake.

## Notes
- Provider is intentionally thin (`lib/email.ts`, one HTTPS call to Resend). Swap to SES /
  SendGrid there without touching the intake route.
- This is separate from `network.notification_events` (which records events but has no
  dispatcher). This path sends directly, which is what the beta needs today.
- Customer-facing confirmation emails are **not** wired here — this is the admin alert only.
