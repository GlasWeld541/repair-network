-- Invoices created from Rex (10/12 call: generate an invoice right after Finish and score).
--
-- A provider can add line items to the repair (e.g. a headlight restoration done at the same
-- visit) and send the invoice to their customer from Rex. The invoice row is the same one the
-- Network job page uses (one per job), so the admin sees exactly what the provider sent.
--   line_items   [{ "description": text, "amount": number }], in order; invoice_amount is their sum
--   sent_at      when it was last emailed to the customer
--   created_from 'network' (admin, job page) or 'rex' (provider, after Finish)
alter table network.invoices
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists created_from text not null default 'network';
