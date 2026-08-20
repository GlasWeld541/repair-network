-- Admin-confirmed acceptance checkpoint (#189, option B). When the admin confirms the
-- assigned shop has accepted the job, we stamp accepted_at and — once — email the customer
-- their match ("you've been matched"). matched_email_sent_at guards against re-sending on a
-- repeat confirm. The customer is never told the vendor before this point.
alter table network.jobs
  add column if not exists accepted_at timestamptz,
  add column if not exists matched_email_sent_at timestamptz;
