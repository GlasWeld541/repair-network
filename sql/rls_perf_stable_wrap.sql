-- RLS perf: helpers were VOLATILE -> re-run per row; network.accounts (4,221 rows)
-- seq-scanned ~25s and blew the 8s authenticated statement_timeout -> homepage/map 500'd.
-- Mark them STABLE + wrap every call in (select ...) so they run ONCE per query (InitPlan).
-- Verified: accounts read 25,562ms -> 9.95ms. Pure performance, no security change.

alter function network.is_glasweld_user() stable;
alter function network.current_shop_account_id() stable;

drop policy if exists "account_payment_methods_admin_all" on network.account_payment_methods;
create policy "account_payment_methods_admin_all" on network.account_payment_methods
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "account_payment_settings_admin_all" on network.account_payment_settings;
create policy "account_payment_settings_admin_all" on network.account_payment_settings
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "accounts_admin_all" on network.accounts;
create policy "accounts_admin_all" on network.accounts
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "accounts_shop_select" on network.accounts;
create policy "accounts_shop_select" on network.accounts
  as permissive for select to authenticated
  using ((id = (select network.current_shop_account_id())));

drop policy if exists "billing_events_admin_all" on network.billing_events;
create policy "billing_events_admin_all" on network.billing_events
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "carrier_claim_routing_rules_admin_all" on network.carrier_claim_routing_rules;
create policy "carrier_claim_routing_rules_admin_all" on network.carrier_claim_routing_rules
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "carrier_contacts_admin_all" on network.carrier_contacts;
create policy "carrier_contacts_admin_all" on network.carrier_contacts
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "carrier_organizations_admin_all" on network.carrier_organizations;
create policy "carrier_organizations_admin_all" on network.carrier_organizations
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "carriers_admin_all" on network.carriers;
create policy "carriers_admin_all" on network.carriers
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "claim_documents_admin_all" on network.claim_documents;
create policy "claim_documents_admin_all" on network.claim_documents
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "claim_intakes_admin_all" on network.claim_intakes;
create policy "claim_intakes_admin_all" on network.claim_intakes
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "claim_routing_audits_admin_all" on network.claim_routing_audits;
create policy "claim_routing_audits_admin_all" on network.claim_routing_audits
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "claim_status_events_admin_all" on network.claim_status_events;
create policy "claim_status_events_admin_all" on network.claim_status_events
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "consumer_intake_photos_admin_all" on network.consumer_intake_photos;
create policy "consumer_intake_photos_admin_all" on network.consumer_intake_photos
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "consumer_intakes_admin_all" on network.consumer_intakes;
create policy "consumer_intakes_admin_all" on network.consumer_intakes
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "contacts_admin_all" on network.contacts;
create policy "contacts_admin_all" on network.contacts
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "invoice_events_admin_all" on network.invoice_events;
create policy "invoice_events_admin_all" on network.invoice_events
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "invoices_admin_all" on network.invoices;
create policy "invoices_admin_all" on network.invoices
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "job_photos_admin_all" on network.job_photos;
create policy "job_photos_admin_all" on network.job_photos
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "job_photos_shop_select" on network.job_photos;
create policy "job_photos_shop_select" on network.job_photos
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM network.jobs j
  WHERE ((j.id = job_photos.job_id) AND (j.assigned_account_id = (select network.current_shop_account_id()))))));

drop policy if exists "job_status_options_admin_all" on network.job_status_options;
create policy "job_status_options_admin_all" on network.job_status_options
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "jobs_admin_all" on network.jobs;
create policy "jobs_admin_all" on network.jobs
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "jobs_shop_select" on network.jobs;
create policy "jobs_shop_select" on network.jobs
  as permissive for select to authenticated
  using ((assigned_account_id = (select network.current_shop_account_id())));

drop policy if exists "notification_events_admin_all" on network.notification_events;
create policy "notification_events_admin_all" on network.notification_events
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "shop_users_admin_all" on network.shop_users;
create policy "shop_users_admin_all" on network.shop_users
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "user_access_requests_admin_all" on network.user_access_requests;
create policy "user_access_requests_admin_all" on network.user_access_requests
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));

drop policy if exists "user_roles_admin_all" on network.user_roles;
create policy "user_roles_admin_all" on network.user_roles
  as permissive for all to authenticated
  using ((select network.is_glasweld_user()))
  with check ((select network.is_glasweld_user()));
