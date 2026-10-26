-- Invoice template (#309) and review link (#310), 10/23 call: a provider saves its logo, a note
-- for the bottom of its invoices and its review link once, and every invoice from Rex uses them.
-- The phone, email and address already live on the account (Business details in Rex).
alter table network.accounts add column if not exists invoice_logo_url text;
alter table network.accounts add column if not exists invoice_note text;
alter table network.accounts add column if not exists review_link text;
