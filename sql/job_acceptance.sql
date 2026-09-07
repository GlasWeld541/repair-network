-- REX-01: provider self-accept. An assigned job is a "job request" the provider accepts
-- (or declines) themselves in Rex, instead of the admin clicking "Confirm shop accepted".
-- `accepted_at` and `matched_email_sent_at` already exist; add the pending-state fields.
--   acceptance_status: 'pending' | 'accepted' | 'declined'  (null = legacy / not tracked;
--     the flow also treats accepted_at IS NULL as pending for backward compatibility)
--   acceptance_deadline: when the request should be accepted by (drives the urgency copy +
--     the admin "past deadline, reassign" view). Set by the assign action.
alter table network.jobs
  add column if not exists acceptance_status text,
  add column if not exists acceptance_deadline timestamptz;
