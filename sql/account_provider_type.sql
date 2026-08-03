-- Consolidate providers into one typed entity.
--
-- A repair-network provider is now either a partner `shop` or an `independent_tech`
-- (a solo Rex field tech enrolled as a provider). Both are `network.accounts` rows, so
-- job assignment, billing, invoices, and the shop-scoped RLS all keep working unchanged.
--
-- An independent_tech account is cross-linked to its Rex field-tech login by
-- `company_email` (the tech is created separately in Rex; enrollment here just creates
-- the account row + the email link). Rex's assigned-jobs lane resolves the tech to this
-- account by that email so they see their assigned jobs when they log into Rex.
--
-- Existing 85 accounts default to 'shop' (they are all partner shops).

alter table network.accounts
  add column if not exists provider_type text not null default 'shop'
  check (provider_type in ('shop', 'independent_tech'));

comment on column network.accounts.provider_type is
  'shop = repair-network partner shop; independent_tech = a solo Rex field tech enrolled as a provider (linked to their Rex login by company_email).';

-- Lookups: filtering the picker by type, and resolving an independent tech by email.
create index if not exists accounts_provider_type_idx on network.accounts (provider_type);
create index if not exists accounts_company_email_lower_idx on network.accounts (lower(company_email));
