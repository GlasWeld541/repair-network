-- Provider repair-score rollup (REX-19, volume hardening).
--
-- The admin intake page used to fetch EVERY job ever assigned to anyone, just to average each
-- provider's approved Rex repair scores in the browser. That fetch grows with every claim for the
-- life of the platform, and PostgREST silently truncates at 1,000 rows, so past that point the
-- averages would quietly become wrong rather than slow.
--
-- Mirrors the proven customer-satisfaction pattern (sql/customer_satisfaction_csi.sql): the average
-- lives on the account and a trigger keeps it current. Only ADMIN-APPROVED scores count — the same
-- rule the page used — so a pending or rejected score never moves a provider's rating.
--
-- Pure additions plus a one-time backfill.

alter table network.accounts
  add column if not exists repair_score_avg numeric(4, 2);            -- 1.00 - 10.00, null until one
alter table network.accounts
  add column if not exists repair_score_count integer not null default 0;

-- Recompute one account from all of its approved scores. Always writes (null / 0 when none), so
-- rejecting a previously approved score can't leave a stale average behind.
create or replace function network.recompute_account_repair_score(p_account_id uuid)
returns void
language plpgsql
as $$
declare
  v_avg numeric(4, 2);
  v_n   integer;
begin
  if p_account_id is null then
    return;
  end if;
  select round(avg(repair_score)::numeric, 2), count(repair_score)
    into v_avg, v_n
  from network.jobs
  where assigned_account_id = p_account_id
    and repair_score_status = 'approved'
    and repair_score is not null;
  update network.accounts
     set repair_score_avg = v_avg,
         repair_score_count = coalesce(v_n, 0)
   where id = p_account_id;
end;
$$;

create or replace function network.trg_job_repair_score()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_account_id is not null then
    perform network.recompute_account_repair_score(new.assigned_account_id);
  end if;
  -- Reassigned: the account it left loses that score.
  if tg_op = 'UPDATE'
     and old.assigned_account_id is distinct from new.assigned_account_id
     and old.assigned_account_id is not null then
    perform network.recompute_account_repair_score(old.assigned_account_id);
  end if;
  return new;
end;
$$;

drop trigger if exists job_repair_score_trg on network.jobs;
create trigger job_repair_score_trg
  after insert or update of repair_score, repair_score_status, assigned_account_id on network.jobs
  for each row
  execute function network.trg_job_repair_score();

-- Backfill every account that has ever had a scored job (accounts with none keep null / 0).
do $$
declare
  r record;
begin
  for r in
    select distinct assigned_account_id as id
    from network.jobs
    where assigned_account_id is not null and repair_score is not null
  loop
    perform network.recompute_account_repair_score(r.id);
  end loop;
end $$;
