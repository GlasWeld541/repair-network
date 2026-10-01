-- Roadmap v2.7, "Insurance billing paths": every job records which of the four ways it was paid.
--   cash             the customer pays the tech directly
--   omega            billed through Omega (the shop's insurance billing software)
--   direct_insurer   billed straight to a carrier GlasWeld has signed
--   tpa              billed through a third-party administrator such as Lynx
-- Separate from payment_path, which only drives the customer-owes math (cash vs insurance) and is
-- left untouched. Nullable: older jobs and jobs where it isn't known yet stay null. Recording only;
-- no integration is built for Omega, direct or TPA billing until carrier discovery picks them.
alter table network.jobs
  add column if not exists billing_path text;

alter table network.jobs
  drop constraint if exists jobs_billing_path_check,
  add constraint jobs_billing_path_check
    check (billing_path is null or billing_path in ('cash', 'omega', 'direct_insurer', 'tpa'));

-- A cash job can only have gone down the cash path.
update network.jobs set billing_path = 'cash' where billing_path is null and payment_path = 'cash';
