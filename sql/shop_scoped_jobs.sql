-- Step 4 — Shop-scoped Jobs Ledger.
--
-- A provider (user_roles.role = 'shop') can read ONLY the jobs assigned to their
-- own account, plus their own account row and job photos. Before this, the only
-- policies on network.jobs/accounts/user_roles were is_glasweld_user() (a hardcoded
-- 5-email internal allowlist), so an external shop couldn't even read their own
-- user_roles row at login — the shop path never actually functioned.
--
-- This migration is PURELY ADDITIVE. The is_glasweld_user() admin policies are left
-- untouched (RLS policies are OR'd), so the 5 internal admin emails keep full access.
-- current_shop_account_id() returns NULL for them (they have no role='shop' row), so
-- these shop policies grant admins nothing extra and cannot change admin behavior.

-- Resolve the logged-in shop's account from user_roles — the table the app writes on
-- grant-access (accounts/[id] "grant access" upserts user_roles role='shop',account_id).
-- Previously this read the empty network.shop_users table, so it always returned NULL.
create or replace function network.current_shop_account_id()
returns uuid
language sql
security definer
set search_path to 'network', 'public'
as $$
  select ur.account_id
  from network.user_roles ur
  where lower(ur.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and ur.role = 'shop'
    and ur.approved = true
    and ur.access_status = 'Active'
  limit 1;
$$;

-- A user may read their OWN user_roles row. Needed so a shop can resolve its role at
-- login; today only is_glasweld_user() could read user_roles at all. Exposes only the
-- caller's own row.
drop policy if exists user_roles_self_select on network.user_roles;
create policy user_roles_self_select on network.user_roles
  for select to authenticated
  using (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- A shop may read its OWN account.
drop policy if exists accounts_shop_select on network.accounts;
create policy accounts_shop_select on network.accounts
  for select to authenticated
  using (id = network.current_shop_account_id());

-- A shop may read jobs assigned to it.
drop policy if exists jobs_shop_select on network.jobs;
create policy jobs_shop_select on network.jobs
  for select to authenticated
  using (assigned_account_id = network.current_shop_account_id());

-- A shop may read photos on its own jobs.
drop policy if exists job_photos_shop_select on network.job_photos;
create policy job_photos_shop_select on network.job_photos
  for select to authenticated
  using (
    exists (
      select 1
      from network.jobs j
      where j.id = job_photos.job_id
        and j.assigned_account_id = network.current_shop_account_id()
    )
  );
