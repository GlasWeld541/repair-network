-- Second-level assignment (10/12 call, roadmap v2.11 shop account): GlasWeld assigns a job to a
-- shop; the shop owner then hands it to one of their technicians in Rex. A technician's job list
-- shows only the jobs handed to them; the owner sees all the shop's jobs.
--   assigned_tech_email  the technician's login (network.user_roles.user_email); null = not handed out
--   assigned_tech_name   how the job page and invoice name them (also written to tech_name)
alter table network.jobs
  add column if not exists assigned_tech_email text,
  add column if not exists assigned_tech_name text;

create index if not exists jobs_assigned_tech_idx
  on network.jobs (assigned_account_id, assigned_tech_email);
