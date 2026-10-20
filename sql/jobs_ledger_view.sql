-- Jobs Ledger, paged and filtered in the database (10/20: growing data is listed server-side).
-- The page used to load every job and every invoice into the browser to filter, sort and total
-- them. This view gives each job its latest invoice's figures, so the views (open, sent to
-- insurance, 30+/60+ days, paid, ongoing, completed, a date range) and the sort columns work as
-- plain filters on one query, a page at a time.
--
-- security_invoker: the view is read with the caller's own rights, so the jobs RLS still applies
-- (an admin sees every job, a shop only its own).
create or replace view network.jobs_ledger with (security_invoker = true) as
select
  j.*,
  i.id as invoice_id,
  i.invoice_number as invoice_number,
  i.submission_status as invoice_submission_status,
  i.payment_status as invoice_payment_status,
  coalesce(i.invoice_amount, j.invoice_amount, 0)::numeric as ledger_invoice,
  coalesce(i.amount_paid, j.amount_paid, 0)::numeric as ledger_paid,
  greatest(coalesce(i.invoice_amount, j.invoice_amount, 0) - coalesce(i.amount_paid, j.amount_paid, 0), 0)::numeric
    as ledger_balance,
  coalesce(j.invoice_date, j.created_at::date) as ledger_date
from network.jobs j
left join lateral (
  select iv.id, iv.invoice_number, iv.submission_status, iv.payment_status, iv.invoice_amount, iv.amount_paid
  from network.invoices iv
  where iv.job_id = j.id
  order by iv.created_at desc
  limit 1
) i on true;

grant select on network.jobs_ledger to authenticated, service_role;

-- The ledger's totals, per-provider rollup and carrier list for the same filters, so the page
-- never needs every row to add them up.
create or replace function network.jobs_ledger_summary(
  p_view text default 'all',
  p_start date default null,
  p_end date default null,
  p_provider uuid default null,
  p_carrier text default null,
  p_account uuid default null
) returns json
language sql
stable
security invoker
set search_path = network, public
as $$
  with scoped as (
    select * from network.jobs_ledger l
    where (p_account is null or l.assigned_account_id = p_account)
  ),
  f as (
    select * from scoped l
    where (p_provider is null or l.assigned_account_id = p_provider)
      and (p_carrier is null or coalesce(l.insurance_carrier, '') = p_carrier)
      and case p_view
        when 'ongoing' then coalesce(l.job_status, 'New') in ('New', 'Accepted', 'In Progress', 'Submitted', 'Not Repairable')
        when 'completed' then l.job_status = 'Completed'
        when 'open' then l.ledger_balance > 0
        when 'submitted' then l.invoice_submission_status = 'Submitted' and l.ledger_balance > 0
        when 'over30' then l.ledger_balance > 0 and l.ledger_date <= current_date - 30
        when 'over60' then l.ledger_balance > 0 and l.ledger_date <= current_date - 60
        when 'paid' then l.ledger_balance <= 0
        else (p_start is null or l.ledger_date >= p_start) and (p_end is null or l.ledger_date <= p_end)
      end
  )
  select json_build_object(
    'count', (select count(*) from f),
    'sales', (select coalesce(sum(ledger_invoice), 0) from f),
    'paid', (select coalesce(sum(ledger_paid), 0) from f),
    'outstanding', (select coalesce(sum(ledger_balance), 0) from f),
    'providers', coalesce((
      select json_agg(p order by p.sales desc) from (
        select coalesce(assigned_account_name, 'Unassigned') as name, count(*) as jobs,
               sum(ledger_invoice) as sales, sum(ledger_paid) as paid, sum(ledger_balance) as outstanding
        from f group by assigned_account_id, assigned_account_name
      ) p
    ), '[]'::json),
    'carriers', coalesce((
      select json_agg(c order by c) from (
        select distinct trim(insurance_carrier) as c from scoped where coalesce(trim(insurance_carrier), '') <> ''
      ) x
    ), '[]'::json)
  );
$$;

grant execute on function network.jobs_ledger_summary(text, date, date, uuid, text, uuid) to authenticated, service_role;
