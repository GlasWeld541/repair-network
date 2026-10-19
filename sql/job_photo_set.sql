-- Required photo set on network jobs (roadmap v2.11, Trello #87). Rex sets photo_set_complete when
-- the repair is finished: VIN + outside-before + outside-after close-ups. A job with an incomplete
-- set doesn't count toward the provider's repair score (routing history). Jobs from before this
-- (null) keep counting, so no provider loses past history.
alter table network.jobs
  add column if not exists mileage integer,
  add column if not exists photo_set_complete boolean;

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
    and repair_score is not null
    and photo_set_complete is not false;
  update network.accounts
     set repair_score_avg = v_avg,
         repair_score_count = coalesce(v_n, 0)
   where id = p_account_id;
end;
$$;

drop trigger if exists job_repair_score_trg on network.jobs;
create trigger job_repair_score_trg
  after insert or update of repair_score, repair_score_status, assigned_account_id, photo_set_complete
  on network.jobs
  for each row
  execute function network.trg_job_repair_score();
