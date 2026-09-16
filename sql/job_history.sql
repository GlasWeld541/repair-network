-- Job history: an audit trail of every status, acceptance and assignment change (REX-19).
--
-- Until now a job carried only its CURRENT status. There was no way to answer "when was this
-- accepted", "who reassigned it", or "how long did it sit before anyone took it" — the questions an
-- admin needs for disputes, provider scoring and insurer reporting. History can't be reconstructed
-- after the fact, so it only has value from the day it starts recording.
--
-- Recorded by a TRIGGER on network.jobs rather than in application code, deliberately: jobs are
-- changed from three places (the Repair Network app, the Rex backend, and scheduled jobs such as
-- the acceptance sweep). A trigger captures all of them, including any added later, and can't be
-- forgotten by a new code path.

create table if not exists network.job_history (
  id          bigserial primary key,
  job_id      uuid not null references network.jobs(id) on delete cascade,
  changed_at  timestamptz not null default now(),
  field       text not null check (field in ('created', 'job_status', 'acceptance_status', 'assigned_provider')),
  from_value  text,
  to_value    text,
  -- The signed-in user's email when a person made the change. 'system' when it came from the Rex
  -- backend or a scheduled job (both use the service key, which carries no user).
  actor       text not null default 'system',
  note        text
);

create index if not exists job_history_job_idx on network.job_history (job_id, changed_at);

-- SECURITY DEFINER so the trigger can write history even though ordinary users are given no
-- INSERT on this table: nobody should be able to write or edit an audit trail directly.
create or replace function network.trg_job_history()
returns trigger
language plpgsql
security definer
set search_path = network, public
as $$
declare
  v_actor text := coalesce(nullif(auth.email(), ''), 'system');
begin
  if tg_op = 'INSERT' then
    insert into network.job_history (job_id, field, to_value, actor)
    values (new.id, 'created', new.job_status, v_actor);
    return new;
  end if;

  if old.job_status is distinct from new.job_status then
    insert into network.job_history (job_id, field, from_value, to_value, actor)
    values (new.id, 'job_status', old.job_status, new.job_status, v_actor);
  end if;

  if old.acceptance_status is distinct from new.acceptance_status then
    insert into network.job_history (job_id, field, from_value, to_value, actor)
    values (new.id, 'acceptance_status', old.acceptance_status, new.acceptance_status, v_actor);
  end if;

  if old.assigned_account_id is distinct from new.assigned_account_id then
    insert into network.job_history (job_id, field, from_value, to_value, actor)
    values (
      new.id, 'assigned_provider',
      coalesce(old.assigned_account_name, case when old.assigned_account_id is null then null else '(unknown provider)' end),
      coalesce(new.assigned_account_name, case when new.assigned_account_id is null then null else '(unknown provider)' end),
      v_actor
    );
  end if;

  return new;
end;
$$;

drop trigger if exists job_history_trg on network.jobs;
create trigger job_history_trg
  after insert or update of job_status, acceptance_status, assigned_account_id on network.jobs
  for each row
  execute function network.trg_job_history();

-- Read access mirrors the job itself: if you can see the job (an admin, or the shop it is assigned
-- to), you can see its history. The subquery runs under the caller's own RLS on network.jobs, so
-- this can never show a shop the history of someone else's job.
alter table network.job_history enable row level security;

drop policy if exists job_history_select on network.job_history;
create policy job_history_select on network.job_history
  for select
  using (exists (select 1 from network.jobs j where j.id = job_history.job_id));

grant select on network.job_history to authenticated;
grant select on network.job_history to service_role;

-- Existing jobs get one row stating plainly where their history begins. It records the status at
-- that moment and does NOT pretend to know what happened before.
insert into network.job_history (job_id, changed_at, field, to_value, actor, note)
select j.id, now(), 'job_status', j.job_status, 'system', 'History recording started'
from network.jobs j
where not exists (select 1 from network.job_history h where h.job_id = j.id);
