-- Tie Derek's candidate cohort (accounts + contacts) together by Zoho record id, and make
-- re-imports idempotent. The Zoho Account id is the natural key linking the two files:
-- contacts.zoho_account_id -> accounts.zoho_account_id.
alter table network.accounts add column if not exists zoho_account_id text;
create unique index if not exists accounts_zoho_account_id_key
  on network.accounts (zoho_account_id) where zoho_account_id is not null;

alter table network.contacts add column if not exists zoho_contact_id text;
create unique index if not exists contacts_zoho_contact_id_key
  on network.contacts (zoho_contact_id) where zoho_contact_id is not null;
