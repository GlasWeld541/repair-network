-- Per-job money math: how much of the price insurance covers, so the job screen can show
-- "customer owes" = price - insurance (the out-of-pocket a tech collects in cash), per the
-- Derek/Shiloh/Nayab walkthrough ("$150 price - $65 insurance = $85 to collect"). Nullable,
-- no default; the price itself stays on jobs.invoice_amount (auto-populated $100 for repairs
-- at creation, editable on the job screen).
alter table network.jobs
  add column if not exists insurance_amount numeric;
