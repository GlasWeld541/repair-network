-- REX-19 idempotency: a notification that must go out once per event carries a dedupe key.
--
-- The job-request email (api/jobs/[id]/notify-assigned) had no guard, so a double click on
-- assign / Create Job sent the provider the same request twice, and the daily card-expiry
-- reminder checked-then-inserted, so two overlapping runs could both remind. The sender now
-- claims the event by inserting its notification row first; the unique key makes that claim
-- atomic, and only the run that wins it sends the email.
--
-- A plain (not partial) unique index, so PostgREST's on_conflict can target it. NULLs never
-- collide, so every existing row and every un-keyed notification is unaffected.
-- Additive and idempotent.

alter table network.notification_events
  add column if not exists dedupe_key text;

create unique index if not exists notification_events_dedupe_key_idx
  on network.notification_events (dedupe_key);
