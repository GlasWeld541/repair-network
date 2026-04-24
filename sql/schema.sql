create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  billing_city text,
  billing_state text,
  account_owner text,
  company_phone text,
  company_email text,
  glasweld_certified text default 'Unknown',
  glasweld_certified_v2 text default 'Unknown',
  certification_date date,
  uses_onyx text not null default 'Unknown',
  uses_zoom_injector text not null default 'Unknown',
  repair_only text not null default 'Likely Yes',
  business_type text default 'Unknown',
  network_fit text not null default 'Unscored',
  outreach_status text not null default 'Not Contacted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounts_name_city_state_idx
  on public.accounts (lower(account_name), lower(coalesce(billing_city, '')), lower(coalesce(billing_state, '')));

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  account_name text not null,
  full_name text,
  first_name text,
  last_name text,
  email text,
  mobile text,
  phone text,
  billing_city text,
  billing_state text,
  glasweld_certified text default 'Unknown',
  glasweld_certified_v2 text default 'Unknown',
  certification_date date,
  contact_status text default 'Active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_accounts_updated_at
before update on public.accounts
for each row execute procedure public.set_updated_at();

create trigger set_contacts_updated_at
before update on public.contacts
for each row execute procedure public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.contacts enable row level security;

create policy "Allow read accounts" on public.accounts for select using (true);
create policy "Allow write accounts" on public.accounts for update using (true);
create policy "Allow insert accounts" on public.accounts for insert with check (true);

create policy "Allow read contacts" on public.contacts for select using (true);
create policy "Allow write contacts" on public.contacts for update using (true);
create policy "Allow insert contacts" on public.contacts for insert with check (true);
