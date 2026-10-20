-- Billing & Gateways, filtered and totalled in the database (10/20: growing data is listed
-- server-side). The page used to load the latest 1,000 fee events, every account and every payment
-- method into the browser to filter, total and page them.

-- Fee totals by status for the page's filters (status / account), in cents.
create or replace function network.billing_events_summary(p_status text default 'all', p_account uuid default null)
returns json
language sql
stable
security invoker
set search_path = network, public
as $$
  select json_build_object(
    'pending', coalesce(sum(amount_cents) filter (where status = 'pending'), 0),
    'invoiced', coalesce(sum(amount_cents) filter (where status = 'invoiced'), 0),
    'paid', coalesce(sum(amount_cents) filter (where status = 'paid'), 0),
    'waived', coalesce(sum(amount_cents) filter (where status = 'waived'), 0),
    'total', coalesce(sum(amount_cents), 0),
    'count', count(*)
  )
  from network.billing_events
  where (p_status is null or p_status = 'all' or status = p_status)
    and (p_account is null or account_id = p_account);
$$;

-- Accounts whose default card has expired or expires within 60 days (lib/card-expiry.ts rule), for
-- the gateway list's "expiring cards" filter.
create or replace function network.expiring_default_card_accounts()
returns setof uuid
language sql
stable
security invoker
set search_path = network, public
as $$
  select distinct account_id
  from network.account_payment_methods
  where method_type = 'card' and is_default and status = 'active'
    and exp_month between 1 and 12 and exp_year is not null
    and (make_date(case when exp_year < 100 then 2000 + exp_year else exp_year end, exp_month, 1)
         + interval '1 month' - interval '1 second') < now() + interval '60 days';
$$;

grant execute on function network.billing_events_summary(text, uuid) to authenticated, service_role;
grant execute on function network.expiring_default_card_accounts() to authenticated, service_role;
