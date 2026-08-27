/**
 * "You've been matched" customer email — sent only AFTER a shop is confirmed as having
 * accepted the job (Shiloh, #189). The vendor is never exposed to the customer before
 * acceptance, so this builder is only ever called from the accept action.
 *
 * Pure (no I/O) so it stays easy to reason about; the caller sends it via lib/email.ts.
 */

const SUPPORT_PHONE = '541-388-1156';
const SUPPORT_PHONE_TEL = '+15413881156';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type MatchedEmailInput = {
  customerName?: string | null;
  shopName?: string | null;
  shopCity?: string | null;
  shopState?: string | null;
  certified?: boolean;
  /** Rolled-up average Rex repair score (approved repairs), if the shop has any. */
  score?: number | null;
};

export function buildMatchedEmail(input: MatchedEmailInput): { subject: string; html: string } {
  const first = String(input.customerName || '').trim().split(' ')[0];
  const greeting = first ? `Hi ${esc(first)},` : 'Hi there,';
  const shop = esc(input.shopName || 'a GlasWeld Network shop');
  const location = [input.shopCity, input.shopState]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(', ');

  // Match reasons — only the ones we can stand behind for this shop.
  const reasons: string[] = ['Close to your location'];
  if (input.certified) reasons.push('GlasWeld-certified shop');
  if (typeof input.score === 'number' && input.score > 0) {
    reasons.push(`Strong repair quality — ${input.score.toFixed(1)}/10 average`);
  }
  const reasonsHtml = reasons
    .map(
      (r) =>
        `<li style="margin:0 0 6px;color:#334155;font-size:14px">${esc(r)}</li>`,
    )
    .join('');

  const locationHtml = location
    ? `<p style="margin:0 0 4px;color:#64748b;font-size:14px">${esc(location)}</p>`
    : '';
  const certifiedBadge = input.certified
    ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;background:#ecfeff;color:#0d7384;font-size:12px;font-weight:600">GlasWeld Certified</span>`
    : '';

  const subject = "You've been matched with a GlasWeld repair shop";
  const html = `\
<div style="margin:0;background:#f1f5f9;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0b90a5;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">GlasWeld</div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;color:#0f172a">${greeting}</p>
      <p style="margin:0 0 16px;color:#334155">Good news — you've been matched with a GlasWeld Network shop for your windshield repair, and they've <b>accepted your job</b>.</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc;margin:0 0 16px">
        <p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0d7384">Your matched shop</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0f172a">${shop}</p>
        ${locationHtml}
        ${certifiedBadge}
      </div>
      <p style="margin:0 0 6px;color:#0f172a;font-weight:600">Why we matched you here:</p>
      <ul style="margin:0 0 16px;padding-left:18px">${reasonsHtml}</ul>
      <p style="margin:0 0 4px;color:#334155">They've accepted your repair — we'll be in touch shortly to confirm the details and schedule your appointment.</p>
      <p style="margin:12px 0 0;color:#334155">Questions in the meantime? Call us at <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#0d7384;font-weight:600;text-decoration:none">${SUPPORT_PHONE}</a>.</p>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px">This is an automated message — no reply needed.</p>
    </div>
  </div>
</div>`;
  return { subject, html };
}

// Where the tech opens their assigned jobs (Rex field-tech view). Env-overridable.
const REX_URL = process.env.REX_APP_URL || 'https://glasweld-rex.vercel.app/rex/';

export type TechAssignmentEmailInput = {
  shopName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** e.g. "2019 Honda Accord" */
  vehicle?: string | null;
  /** e.g. "Bend, OR 97702" */
  location?: string | null;
  /** short damage summary */
  damage?: string | null;
  /** 'repair' | 'replacement' */
  serviceType?: string | null;
};

/**
 * "New job assigned" email to the assigned shop/tech — sent once when a job is first accepted,
 * so the tech is alerted and has the customer contact + details to schedule immediately (they
 * no longer have to notice it in Rex). Pure; the caller sends it via lib/email.ts.
 */
export function buildTechAssignmentEmail(
  input: TechAssignmentEmailInput,
): { subject: string; html: string } {
  const shop = String(input.shopName || '').trim();
  const greeting = shop ? `Hi ${esc(shop)},` : 'Hi,';
  const svc =
    String(input.serviceType || 'repair').toLowerCase() === 'replacement'
      ? 'replacement'
      : 'repair';

  const rows: [string, string | null | undefined][] = [
    ['Customer', input.customerName],
    ['Phone', input.customerPhone],
    ['Vehicle', input.vehicle],
    ['Location', input.location],
    ['Damage', input.damage],
  ];
  const rowsHtml = rows
    .filter(([, v]) => String(v || '').trim())
    .map(
      ([label, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${esc(
          label,
        )}</td><td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join('');

  const subject = `New ${svc} job assigned${
    input.location ? ` — ${String(input.location).trim()}` : ''
  }`;
  const html = `\
<div style="margin:0;background:#f1f5f9;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0b90a5;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">GlasWeld</div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;color:#0f172a">${greeting}</p>
      <p style="margin:0 0 16px;color:#334155">A new <b>${esc(svc)}</b> job has been assigned to you. Here are the details to schedule it:</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc;margin:0 0 16px">
        <table style="border-collapse:collapse">${rowsHtml}</table>
      </div>
      <a href="${esc(REX_URL)}" style="display:inline-block;background:#0b90a5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Open in Rex</a>
      <p style="margin:16px 0 0;color:#334155">Please reach out to the customer to schedule the ${esc(svc)} as soon as possible.</p>
      <p style="margin:12px 0 0;color:#64748b;font-size:13px">Questions? Call <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#0d7384;font-weight:600;text-decoration:none">${SUPPORT_PHONE}</a>. This is an automated message.</p>
    </div>
  </div>
</div>`;
  return { subject, html };
}
