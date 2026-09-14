-- REX-19 — volume hardening, step 1: indexes on the tables that grow 1:1 with claim volume.
--
-- Context (Derek, 2026-09-10 call): Geico alone runs 1M+ glass claims a year, ~18M a year in
-- the US. network.jobs grows with every claim, and today it carries only its primary key plus
-- two narrow indexes (consumer_intake_id, and a partial on the CSI token). Every job query —
-- the admin ledger, a shop's own ledger, Rex's assigned-jobs lane, the hourly acceptance
-- sweep — is a sequential scan. Same for invoices and job_photos, which are looked up by
-- job_id with no index on job_id at all.
--
-- These are pure additions: no behaviour change, no data change. Safe to run on a live table
-- at the current size (jobs ~20 rows, invoices ~9, job_photos ~62) so a plain CREATE INDEX
-- takes milliseconds and needs no CONCURRENTLY. If this is ever re-run against a large table,
-- switch to CREATE INDEX CONCURRENTLY and run each statement outside a transaction.

-- 1. Admin jobs ledger: SELECT * FROM jobs ORDER BY created_at DESC (no filter).
create index if not exists jobs_created_idx
  on network.jobs (created_at desc);

-- 2. Rex's assigned-jobs lane and a shop's own ledger:
--      .eq(assigned_account_id) .in(job_status, [...]) .order(created_at desc)
--    Equality column first, then the IN filter, then the sort key.
create index if not exists jobs_assigned_account_status_idx
  on network.jobs (assigned_account_id, job_status, created_at desc);

-- 3. Hourly acceptance sweep. Both of its queries filter on acceptance_status and
--    admin_reassign_notified_at IS NULL, so a partial index keeps this tiny — it only ever
--    holds the handful of jobs still awaiting a decision, not the whole history.
create index if not exists jobs_acceptance_sweep_idx
  on network.jobs (acceptance_status, acceptance_deadline)
  where admin_reassign_notified_at is null;

-- 4. Invoice lookup for the jobs ledger: .in('job_id', jobIds).
create index if not exists invoices_job_idx
  on network.invoices (job_id);

-- 5. Photos are fetched per job on the job screen, the invoice page and the scoring route.
create index if not exists job_photos_job_idx
  on network.job_photos (job_id);
