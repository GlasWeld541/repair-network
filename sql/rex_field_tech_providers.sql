-- Auto-list Rex field techs as repair-network providers.
--
-- Every Rex field-tech user (public.user_roles.role = 'field_tech') should appear in the
-- repair app's provider list and be assignable/billable like a shop. Jobs reference
-- network.accounts(id), so each tech needs an account row. This backfills the existing
-- field techs and adds a trigger so new ones are synced automatically.
--
-- Treated like shops: fee bps are left to inherit the standard 300 (repair) / 700
-- (replacement) defaults (NOT fee-exempt). Cross-linked to the Rex login by
-- lower(company_email) = the tech's auth email -- the same key that
-- backend/app/routers/repairs.py::_independent_tech_account_id resolves on, so a tech who
-- logs into Rex sees the jobs assigned to their account.
--
-- account_name falls back to the email (Rex field techs carry no name in auth metadata);
-- an admin can rename it on the Accounts page. Idempotent on lower(company_email).

-- 1. Backfill existing field techs.
insert into network.accounts (account_name, company_email, provider_type, active)
select au.email, au.email, 'independent_tech', true
from public.user_roles ur
join auth.users au on au.id = ur.user_id
where ur.role = 'field_tech'
  and au.email is not null
  and not exists (
    select 1 from network.accounts a
    where lower(a.company_email) = lower(au.email)
  );

-- 2. Keep it live: a newly-assigned field_tech role -> an independent_tech provider account
--    (same rule as the backfill). SECURITY DEFINER so the trigger can read auth.users and
--    write network.accounts regardless of the invoking role.
create or replace function public.tg_sync_field_tech_provider()
returns trigger
language plpgsql
security definer
set search_path = public, network
as $$
declare
  v_email text;
begin
  if NEW.role = 'field_tech' then
    select email into v_email from auth.users where id = NEW.user_id;
    if v_email is not null and not exists (
      select 1 from network.accounts a where lower(a.company_email) = lower(v_email)
    ) then
      insert into network.accounts (account_name, company_email, provider_type, active)
      values (v_email, v_email, 'independent_tech', true);
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists sync_field_tech_provider on public.user_roles;
create trigger sync_field_tech_provider
  after insert or update of role on public.user_roles
  for each row execute function public.tg_sync_field_tech_provider();
