-- Customer-notification path fix.
--
-- The consumer-intake route inserts notification_events rows tagged with
-- `consumer_intake_id` (both the admin alert and the customer confirmation), but the
-- table only had claim_intake_id / job_id / account_id / carrier_id — so every such
-- insert failed silently and NO customer confirmation was ever recorded or sent.
--
-- Add the missing typed link (mirrors the existing per-entity FK columns) so the audit
-- rows persist and the customer confirmation email can be tracked.

alter table network.notification_events
  add column if not exists consumer_intake_id uuid
    references network.consumer_intakes(id) on delete set null;

create index if not exists notification_events_consumer_intake_idx
  on network.notification_events (consumer_intake_id);
