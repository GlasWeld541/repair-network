-- REX-03a: shop-level billing profiles. Every member shop needs a billing setup before it
-- can receive routed jobs: pay-per-completed-job, monthly auto-bill, or approved corporate
-- invoice terms. This adds the profile fields; the routing gate keys off them (ships flag-off
-- until shops are onboarded to billing + a payment processor is wired — see REX-03c).
--   billing_profile_type: 'pay_per_job' | 'monthly' | 'corporate' (null = not set up yet)
--   ap_billing_email / billing_contact_name: corporate AP contact for the emailed invoice
--   corporate_invoice_approved: admin has approved this account for pay-outside corporate terms
--   billing_past_due: set when a charge fails / an invoice ages unpaid (drives the gate)
-- Reuses the existing billing_enabled / monthly_billing_enabled / autopay_enabled /
-- billing_cycle_day columns for the per-profile mechanics.
alter table network.accounts
  add column if not exists billing_profile_type text,
  add column if not exists ap_billing_email text,
  add column if not exists billing_contact_name text,
  add column if not exists corporate_invoice_approved boolean not null default false,
  add column if not exists billing_past_due boolean not null default false;
