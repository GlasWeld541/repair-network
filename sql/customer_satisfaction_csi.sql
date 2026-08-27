-- Customer Satisfaction Index (CSI)
-- ---------------------------------
-- Per-job customer rating (1-5) rolled up to a rolling average on the shop/account, used as a
-- ranking factor in job assignment. This matches the PRD's network model: a tech's rank is
-- earned via "scores, certification, and customer satisfaction (CSI)". This migration adds only
-- the storage + aggregation; the customer-facing collection flow (when/how the customer is
-- prompted to rate at completion) is a separate, still-to-be-finalized piece.
--
-- Apply against the shared project's `network` schema (zcpanevtzbruvigonysm) via the Management API.

-- Per-job rating (1-5). Nullable until a rating exists for that job.
alter table network.jobs
  add column if not exists customer_satisfaction smallint
    check (customer_satisfaction is null or customer_satisfaction between 1 and 5);
alter table network.jobs
  add column if not exists customer_satisfaction_at timestamptz;

-- Rolling CSI on the account: the average of its rated jobs, plus how many ratings it's based on.
alter table network.accounts
  add column if not exists csi_score numeric(3, 2);          -- 1.00 - 5.00, null until first rating
alter table network.accounts
  add column if not exists csi_count integer not null default 0;

-- Recompute one account's rolling CSI from all of its rated jobs. Always writes (null score / 0
-- count when the account has no ratings) so removing a rating can't leave a stale average.
create or replace function network.recompute_account_csi(p_account_id uuid)
returns void
language plpgsql
as $$
declare
  v_avg numeric(3, 2);
  v_n   integer;
begin
  if p_account_id is null then
    return;
  end if;
  select round(avg(customer_satisfaction)::numeric, 2), count(customer_satisfaction)
    into v_avg, v_n
  from network.jobs
  where assigned_account_id = p_account_id
    and customer_satisfaction is not null;
  update network.accounts
     set csi_score = v_avg,
         csi_count = coalesce(v_n, 0)
   where id = p_account_id;
end;
$$;

-- Keep the rolling CSI in sync whenever a job's rating (or its assigned account) changes.
create or replace function network.trg_job_csi()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_account_id is not null then
    perform network.recompute_account_csi(new.assigned_account_id);
  end if;
  -- If the job was reassigned, refresh the account it left too.
  if tg_op = 'UPDATE'
     and old.assigned_account_id is distinct from new.assigned_account_id
     and old.assigned_account_id is not null then
    perform network.recompute_account_csi(old.assigned_account_id);
  end if;
  return new;
end;
$$;

drop trigger if exists job_csi_trg on network.jobs;
create trigger job_csi_trg
  after insert or update of customer_satisfaction, assigned_account_id on network.jobs
  for each row
  execute function network.trg_job_csi();
