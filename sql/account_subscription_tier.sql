-- Free vs Pro provider access (Derek, 2026-09-15 call).
--
-- "Not every provider shop will be a subscriber. What's most important is the network footprint."
-- So a provider account now carries a subscription tier:
--
--   free (default) — logs in, receives and completes jobs, keeps a payment method on file, and
--                    still pays GlasWeld's per-job fee. Sees Rex coaching and certification, locked.
--   pro            — the paid tier: adds Rex coaching and certification.
--
-- Everyone starts free on purpose. Onboarding is "here's a job, put a payment method on file", not
-- a sales call; upselling happens after they are receiving work.
--
-- Until Braintree subscriptions exist, an admin flips this on the account page. When subscriptions
-- land, the webhook writes this same column and nothing else changes.

alter table network.accounts
  add column if not exists subscription_tier text not null default 'free';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_subscription_tier_check'
  ) then
    alter table network.accounts
      add constraint accounts_subscription_tier_check
      check (subscription_tier in ('free', 'pro'));
  end if;
end $$;

comment on column network.accounts.subscription_tier is
  'free | pro. Pro adds Rex coaching + certification. Jobs and fees are unaffected.';
