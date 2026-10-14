-- Repair photos on the invoice (10/14 call: every photo of the repair can go on the invoice, not
-- only the before and after; the tech can untick any they don't want the customer to see).
--   photos  the photo urls the provider chose to show, in order; null = every repair photo
--           (the default, so invoices made before this keep showing all of them)
alter table network.invoices
  add column if not exists photos jsonb;
