-- Member financing flag + consumer financing-need routing filter (Shiloh, 2026-08).
--
--   * A member self-declares whether they offer a customer payment plan
--     (offers_financing) and optionally which provider (financing_provider — e.g.
--     Klarna, Affirm, Zip, PayTomorrow, Synchrony). Self-declared, editable in the
--     member profile. This is a ROUTING FILTER ONLY — it must NEVER feed rank, routing
--     priority, badges, or the compliance score.
--   * A consumer replacement lead that chose cash / out-of-pocket can flag that it needs
--     to spread the cost over time (needs_financing). When true, matching is filtered to
--     members with offers_financing = true (applied AFTER the normal routing criteria).
--
-- Additive + nullable/defaulted; existing rows keep the defaults. No RLS change (the
-- table-level policies already cover new columns).
alter table network.accounts
  add column if not exists offers_financing boolean not null default false,
  add column if not exists financing_provider text;

comment on column network.accounts.offers_financing is
  'Self-declared: member offers a customer payment plan. Routing FILTER only — never a rank/priority/badge/compliance input.';
comment on column network.accounts.financing_provider is
  'Self-declared provider (Klarna/Affirm/Zip/PayTomorrow/Synchrony/etc.), free text, nullable.';

alter table network.consumer_intakes
  add column if not exists needs_financing boolean not null default false;

comment on column network.consumer_intakes.needs_financing is
  'Consumer (replacement + cash) asked to spread the cost over time. When true, matching filters to accounts.offers_financing = true. Never affects ranking.';
