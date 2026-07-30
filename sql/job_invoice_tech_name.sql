-- Required technician name captured when a job is marked complete, carried onto the
-- invoice (web view + PDF). Free text — "technician" here is the individual who did the
-- repair; the shop/provider stays the account. Additive + nullable (existing rows stay
-- null; the app enforces the requirement at completion time, not in the DB).
alter table network.jobs
  add column if not exists tech_name text;

alter table network.invoices
  add column if not exists tech_name text;
