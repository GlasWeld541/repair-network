-- A provider's own payment link (roadmap v2.11: Pay Now link + QR on the invoice, the first step
-- before Stripe Connect). The tech pastes a link from what they already use (Square, Stripe,
-- PayPal, Venmo); Rex puts a Pay Now button on the invoice email and a QR code on the invoice. The
-- customer's money goes straight to the tech; the tech still marks the invoice paid.
alter table network.accounts
  add column if not exists payment_link text;
