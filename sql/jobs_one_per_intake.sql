-- REX-19 idempotency: one job per customer request.
--
-- Create Job on the intake page is locked while it runs and once the intake has a job, but that
-- lock lives in one browser tab. Two admins (or two tabs) could each create a job for the same
-- request and route it to two providers. A request becoming a replacement keeps its same job
-- (service_type changes on that row), so one job per intake is the real rule; the database now
-- holds it. Checked live 2026-10-05: no intake has more than one job.
-- Additive and idempotent.

create unique index if not exists jobs_consumer_intake_unique_idx
  on network.jobs (consumer_intake_id)
  where consumer_intake_id is not null;
