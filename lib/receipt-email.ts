import { esc, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from './matched-email';

export type FeeReceiptInput = {
  amountCents: number;
  /** e.g. "Visa ending 1881" */
  methodLabel: string;
  /** e.g. "2025 Audi Q5 · Combo Break"; omitted when the job isn't known. */
  jobLabel?: string | null;
  transactionId: string;
  chargedAt: Date;
  accountName?: string | null;
};

/**
 * The receipt a provider gets by email each time a GlasWeld fee is charged to their card on file:
 * how much, for which job, to which card, when, and the payment reference to quote. Providers can
 * see the same history in Rex's Billing screen; the email is the record they keep for their books.
 * Pure: the caller sends it via lib/email.ts.
 */
export function buildFeeReceiptEmail(input: FeeReceiptInput): { subject: string; html: string } {
  const amount = (input.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const date = input.chargedAt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const name = String(input.accountName || '').trim();
  const rows: [string, string][] = [
    ['Amount', amount],
    ['Charged to', input.methodLabel],
    ['Date', date],
    ...(input.jobLabel ? ([['Job', input.jobLabel]] as [string, string][]) : []),
    ['Payment reference', input.transactionId],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#64748b;font-size:14px">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right">${esc(v)}</td></tr>`,
    )
    .join('');

  const subject = `Receipt: GlasWeld fee of ${amount}`;
  const html = `\
<div style="margin:0;background:#f1f5f9;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0b90a5;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">GlasWeld</div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;color:#0f172a">${name ? `Hi ${esc(name)},` : 'Hi there,'}</p>
      <p style="margin:0 0 16px;color:#334155">Your GlasWeld referral fee has been charged. Here are the details for your records.</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${table}</table>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px">You can see every fee in the Billing screen in Rex. Questions? Call <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#0d7384;font-weight:600;text-decoration:none">${SUPPORT_PHONE}</a>. This is an automated message.</p>
    </div>
  </div>
</div>`;
  return { subject, html };
}
