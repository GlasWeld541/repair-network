-- Customer-facing satisfaction collection (CSI, Option A: request on job completion)
-- ---------------------------------------------------------------------------------
-- Builds on the CSI ranking migration (customer_satisfaction_csi.sql), which already added
-- network.jobs.customer_satisfaction (1-5) + customer_satisfaction_at and the account rollup
-- trigger. This adds only what the *collection* flow needs: a per-job link token, a
-- "request sent" timestamp (for idempotency + status), and an optional free-text comment.
--
-- When the customer submits a rating, writing customer_satisfaction fires the existing
-- network.trg_job_csi trigger, so the shop's rolling csi_score updates automatically — no
-- extra ranking work here. All additive + idempotent.
--
-- Apply against the shared project's `network` schema (zcpanevtzbruvigonysm) via the Management API.

-- Unguessable per-job token that gates the public rating page (set when a request is sent).
alter table network.jobs
  add column if not exists customer_satisfaction_token uuid;

-- When the rating request was sent (idempotency: don't re-send; also drives the admin status).
alter table network.jobs
  add column if not exists customer_satisfaction_requested_at timestamptz;

-- Optional free-text comment the customer leaves alongside the 1-5 score.
alter table network.jobs
  add column if not exists customer_satisfaction_comment text;

-- The public rating page looks a job up by its token — keep that lookup fast.
create index if not exists jobs_customer_satisfaction_token_idx
  on network.jobs (customer_satisfaction_token)
  where customer_satisfaction_token is not null;
