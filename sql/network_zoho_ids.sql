-- Tie Derek's candidate cohort (accounts + contacts) together by Zoho record id, and make
-- re-imports idempotent. The Zoho Account id is the natural key linking the two files:
-- contacts.zoho_account_id -> accounts.zoho_account_id.
alter table network.accounts add column if not exists zoho_account_id text;
alter table network.contacts add column if not exists zoho_contact_id text;

-- Non-partial unique indexes so a PostgREST upsert (ON CONFLICT) can target them. NULLs are
-- distinct in a unique index, so the many web-only / public rows that have no Zoho id still
-- insert freely; only real Zoho ids are deduped.
drop index if exists network.accounts_zoho_account_id_key;
create unique index accounts_zoho_account_id_key on network.accounts (zoho_account_id);
drop index if exists network.contacts_zoho_contact_id_key;
create unique index contacts_zoho_contact_id_key on network.contacts (zoho_contact_id);
