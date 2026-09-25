-- Payment-gateway vault + charge audit (Braintree groundwork).
--
-- Everything around the processor already exists: fees accrue on job completion, the 1st-of-month
-- cron invoices them, and the 5th-of-month charge cron is live and has been answering 501 because
-- there was nothing to charge with. These are the columns that path needs. No processor is wired
-- by this migration and nothing starts charging because of it.
--
-- The rule these columns encode: we never hold a card or a bank number. The provider tokenizes at
-- the gateway from their own browser and we keep only the vault reference plus harmless
-- descriptors (brand, last 4, expiry) that already exist on the table.

-- 1. The gateway-side customer, one per provider account. Braintree vaults payment methods under
--    a customer, so the token alone is not enough to charge; both are needed together.
alter table network.account_payment_methods
  add column if not exists gateway_customer_id text;

alter table network.account_payment_methods
  add column if not exists gateway_provider text;

-- When the instrument was last confirmed usable by the gateway. Null means "typed in by an admin",
-- which is every row today: `external_payment_method_id` is currently a free-text field with no
-- validation behind it. Once tokenization is live this separates real instruments from notes.
alter table network.account_payment_methods
  add column if not exists verified_at timestamptz;

comment on column network.account_payment_methods.external_payment_method_id is
  'Gateway vault token. Paired with gateway_customer_id to charge. Never card or bank numbers.';

-- 2. Charge audit on the fee itself, so a decline is visible rather than inferred from a fee that
--    silently stayed invoiced.
alter table network.billing_events
  add column if not exists gateway_transaction_id text;

alter table network.billing_events
  add column if not exists charge_attempted_at timestamptz;

alter table network.billing_events
  add column if not exists charge_error text;

-- A gateway transaction settles exactly one fee. If the charge cron ever double-charges despite
-- its idempotency key, this constraint turns it into a loud failure instead of a quiet duplicate.
create unique index if not exists billing_events_gateway_txn_idx
  on network.billing_events (gateway_transaction_id)
  where gateway_transaction_id is not null;

-- 3. The charge cron reads invoiced fees for a period; index the shape it actually queries.
create index if not exists billing_events_invoiced_period_idx
  on network.billing_events (status, occurred_at)
  where status = 'invoiced';

-- 4. One default active instrument per account is an assumption the charge path relies on: it
--    looks up "the" default method. Enforce it rather than trusting the writer.
create unique index if not exists account_payment_methods_one_default_idx
  on network.account_payment_methods (account_id)
  where is_default and status = 'active';

-- 5. Audit trail of Braintree webhooks (app/api/payments/webhook). Every VERIFIED notification is
--    recorded with what it did, so "why did this fee go back to outstanding" has an answer.
create table if not exists network.payment_webhook_events (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  transaction_id text,
  outcome        text,
  received_at    timestamptz not null default now()
);

create index if not exists payment_webhook_events_txn_idx
  on network.payment_webhook_events (transaction_id)
  where transaction_id is not null;

alter table network.payment_webhook_events enable row level security;

-- A new table in the network schema gets NO grants by default. Without these the webhook's audit
-- insert was refused with permission denied and, being best-effort, dropped silently: caught
-- 2026-09-25 when a live signed notification returned 200 and left the table empty.
grant select, insert on network.payment_webhook_events to service_role;
grant select on network.payment_webhook_events to authenticated;
-- Written by the service role only; admins may read it.
drop policy if exists payment_webhook_events_admin_read on network.payment_webhook_events;
create policy payment_webhook_events_admin_read on network.payment_webhook_events
  for select using ((select network.is_glasweld_user()));
