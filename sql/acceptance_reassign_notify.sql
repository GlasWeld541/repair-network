-- Admin "needs reassignment" alert guard.
--
-- When a provider declines a job request, or the 24h acceptance window lapses without an
-- accept, the job needs a new provider. The acceptance-sweep cron emails the admin once per
-- such episode; this timestamp records that the alert was sent so the cron doesn't re-notify
-- every run. It is cleared (set null) whenever the job is (re)assigned, starting a fresh
-- episode that can notify again.
alter table network.jobs
  add column if not exists admin_reassign_notified_at timestamptz;
