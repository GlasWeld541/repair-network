-- Optional payment-method captured at job completion, for reporting only (Shiloh, 2026-08).
--
-- The platform fee is ALWAYS computed on the full invoice total, regardless of how the
-- customer paid (cash / card / insurance / third-party financing) — this column does NOT
-- change the fee basis. It is distinct from the existing `payment_path` (cash/insurance),
-- which drives the customer-owes math; `payment_method` also captures card + financing for
-- reporting. Additive + nullable (existing rows stay null).
alter table network.jobs
  add column if not exists payment_method text
  check (payment_method is null or payment_method in ('cash', 'card', 'insurance', 'financing'));

comment on column network.jobs.payment_method is
  'Optional, reporting only. How the customer paid (cash/card/insurance/financing). Does NOT change the fee basis — the platform fee is always the full invoice total.';
