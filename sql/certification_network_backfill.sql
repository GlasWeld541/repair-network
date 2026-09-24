-- Backfill: techs already certified in Rex get the Certified flag on their network account.
--
-- Until 2026-09-24 nothing connected the two "certified" fields. Rex writes
-- public.user_certifications; the Repair Network reads network.accounts.glasweld_certified, which
-- drives the Certified badge in the provider picker and the certified-first ranking. So anyone
-- certified before the sync existed is certified in Rex and "Unknown" in the network.
--
-- The Rex backend now mirrors every grant, revoke and course completion
-- (backend/app/certification_sync.py). This catches up the ones that happened before it.
--
-- Matches the same two ways the Rex backend resolves a provider: an independent tech by
-- company_email, or a shop through its network.user_roles row. Only ever sets Yes; it never
-- downgrades a shop an admin marked by hand.

update network.accounts a
   set glasweld_certified = 'Yes'
  from public.user_certifications uc
  join auth.users u on u.id = uc.user_id
 where uc.certified
   and coalesce(a.glasweld_certified, '') <> 'Yes'
   and (
     lower(a.company_email) = lower(u.email)
     or a.id in (
       select r.account_id from network.user_roles r
        where lower(r.user_email) = lower(u.email)
          and r.role = 'shop' and r.account_id is not null
     )
   );
