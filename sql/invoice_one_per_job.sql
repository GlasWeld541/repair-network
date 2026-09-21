-- One invoice per job (REX-19 idempotency audit).
--
-- Invoice creation was the one money path with no idempotency guard at all: no pre-insert check,
-- no upsert, no unique constraint. The only thing standing between an admin and a second invoice
-- was the "Generate Invoice" button hiding itself, and that is driven by client state loaded at
-- page load. So two admins on the same job, the same admin in two tabs, or one admin retrying
-- after an ambiguous failure would each write another invoice row.
--
-- The damage was worse than an extra row, because the reader asked for the invoice with
-- .maybeSingle(). Two rows made that call fail with "multiple rows returned" and hand back null,
-- which hid the whole invoice and payment section of the job screen. Payments could no longer be
-- collected there, and the Generate Invoice button reappeared, inviting a third duplicate.
--
-- The rest of the app already assumes one invoice per job (the job list keys invoices by job_id,
-- and both the price sync and the tech-name sync write "the" invoice by id), so this constraint
-- states a rule the code already relies on.

-- Guard rail: fail loudly rather than silently skipping if duplicates already exist, so nobody
-- concludes the constraint is in place when it is not. (Verified clean before first apply:
-- 3 invoices, 0 job_ids with more than one.)
do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select job_id from network.invoices
     where job_id is not null
     group by job_id having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception
      'Cannot add the one-invoice-per-job constraint: % job(s) already have more than one invoice. Merge them first.', dupes;
  end if;
end $$;

-- Partial, because job_id is nullable and several NULLs are not a conflict.
create unique index if not exists invoices_job_unique_idx
  on network.invoices (job_id)
  where job_id is not null;
