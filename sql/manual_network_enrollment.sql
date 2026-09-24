-- Manual network enrollment (Shiloh, 2026-09-23).
--
-- Until now a Rex field tech became a Repair Network provider automatically: the trigger
-- sync_field_tech_provider on public.user_roles (sql/rex_field_tech_providers.sql) inserted an
-- independent_tech account the moment anyone was given the field_tech role. Nobody chose any of
-- the 17 providers it created, and they include staff and test logins.
--
-- Shiloh wants to decide who joins the network. So:
--   1. Stop the automatic enrollment. Creating a Rex login no longer creates a provider.
--   2. Admins enrol a provider from the Accounts page instead (app/api/accounts/enroll).
--
-- The existing 17 accounts are untouched here. Deciding which stay is a separate, deliberate step.

-- 1. Turn off automatic enrollment. The function is kept (not dropped) so the rule it encoded is
--    still readable and the trigger can be restored in one line if ever wanted.
drop trigger if exists sync_field_tech_provider on public.user_roles;

comment on function public.tg_sync_field_tech_provider() is
  'DISABLED 2026-09-24: network enrollment is now manual (sql/manual_network_enrollment.sql). '
  'Kept for reference; the trigger that called it was dropped.';

-- 2. Does a Rex login exist for this email? The enrollment form warns when it does not, because
--    the email is what links a provider to their Rex app: without a matching login their assigned
--    jobs have nowhere to appear. auth.users is not readable through the API, so expose exactly
--    this one yes/no answer and nothing else about the user.
create or replace function network.rex_login_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = auth, public
as $$
  select exists (
    select 1 from auth.users u where lower(u.email) = lower(trim(p_email))
  );
$$;

revoke all on function network.rex_login_exists(text) from public, anon, authenticated;
grant execute on function network.rex_login_exists(text) to service_role;
