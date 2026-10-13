-- Owner or technician, per shop login (10/12 call + roadmap v2.11 "Shop Account": a shop owner
-- view on a Pro account). The owner sees the shop's money, billing and team in Rex; a technician
-- sees only their own jobs and repairs. Existing logins become owners so nobody loses access they
-- have today; new logins on an account that already has an owner default to technician.
alter table network.user_roles
  add column if not exists shop_role text not null default 'owner'
    check (shop_role in ('owner', 'technician'));
