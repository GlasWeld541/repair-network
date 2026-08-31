import { esc, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from './matched-email';

export type RatingRequestEmailInput = {
  /** The rating page URL for this job (…/rate/<token>). */
  ratingUrl: string;
  customerName?: string | null;
  /** Shop/provider that did the work, for context ("your service from X"). */
  shopName?: string | null;
  /** e.g. "2019 Honda Accord" */
  vehicle?: string | null;
};

/**
 * "How was your service?" email to the CUSTOMER after their job is completed. Each star is a
 * deep-link into the rating page with the score pre-selected (they can still change it), plus a
 * plain button as a fallback for clients that strip the query. Pure — the caller sends it via
 * lib/email.ts. The trigger that fires this (job completion) is deliberately kept separate so it
 * can be moved later (e.g. to invoice-signed) without touching this builder.
 */
export function buildRatingRequestEmail(
  input: RatingRequestEmailInput,
): { subject: string; html: string } {
  const name = String(input.customerName || '').trim();
  const greeting = name ? `Hi ${esc(name.split(/\s+/)[0])},` : 'Hi there,';
  const shop = String(input.shopName || '').trim();
  const vehicle = String(input.vehicle || '').trim();
  const forWhat = vehicle ? ` on your ${esc(vehicle)}` : '';
  const byWhom = shop ? ` by ${esc(shop)}` : '';

  // Five star links, each pre-selecting its score on the rating page.
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${esc(input.ratingUrl)}?r=${n}" style="text-decoration:none;font-size:34px;line-height:1;color:#f59e0b;padding:0 3px" aria-label="${n} star${
          n === 1 ? '' : 's'
        }">&#9733;</a>`,
    )
    .join('');

  const subject = 'How was your windshield service?';
  const html = `\
<div style="margin:0;background:#f1f5f9;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0b90a5;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">GlasWeld</div>
    <div style="padding:24px;text-align:center">
      <p style="margin:0 0 12px;color:#0f172a;text-align:left">${greeting}</p>
      <p style="margin:0 0 20px;color:#334155;text-align:left">Your windshield service${forWhat}${byWhom} is complete. How did we do? Tap a star to rate your experience — it takes a few seconds and helps us keep quality high.</p>
      <div style="margin:0 0 18px">${stars}</div>
      <a href="${esc(input.ratingUrl)}" style="display:inline-block;background:#0b90a5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:10px">Rate your service</a>
      <p style="margin:20px 0 0;color:#64748b;font-size:13px;text-align:left">Questions? Call <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#0d7384;font-weight:600;text-decoration:none">${SUPPORT_PHONE}</a>. This is an automated message.</p>
    </div>
  </div>
</div>`;
  return { subject, html };
}
