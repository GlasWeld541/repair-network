-- Rex repair score on a customer job (Phase 5 of the customer → job → repair loop).
-- When the assigned provider uploads the before/after photos, the app calls Rex's scoring
-- engine (backend POST /public/score-repair) and stores the 1-10 result here. This mirrors
-- repair_submissions.rex_score_* so a customer repair is reviewed exactly like a field-tech
-- submission (pass line 6), just anchored to the customer via the job.
alter table network.jobs
  add column if not exists repair_score smallint,
  add column if not exists repair_score_why text,
  add column if not exists repair_score_detail jsonb,
  add column if not exists repair_score_status text
    check (repair_score_status in ('pending', 'approved', 'rejected')),
  add column if not exists repair_scored_at timestamptz;
