create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.accounts
  add column if not exists billing_enabled boolean not null default true,
  add column if not exists completed_job_fee_cents integer not null default 150,
  add column if not exists edi_submission_fee_cents integer not null default 0,
  add column if not exists monthly_billing_enabled boolean not null default true,
  add column if not exists billing_cycle_day integer not null default 1,
  add column if not exists autopay_enabled boolean not null default true,
  add column if not exists billing_terms_notes text,
  add column if not exists payment_gateway_provider text not null default 'manual',
  add column if not exists payment_gateway_status text not null default 'not_connected',
  add column if not exists processor_merchant_id text,
  add column if not exists processor_rev_share_bps integer not null default 0,
  add column if not exists payment_gateway_notes text;

alter table public.accounts
  alter column monthly_billing_enabled set default true,
  alter column billing_cycle_day set default 1,
  alter column autopay_enabled set default true;

update public.accounts
set
  monthly_billing_enabled = true,
  billing_cycle_day = 1,
  autopay_enabled = true;

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  billing_key text not null unique,
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid,
  invoice_id uuid,
  event_type text not null,
  description text not null,
  amount_cents integer not null default 0,
  status text not null default 'pending',
  occurred_at timestamptz not null default now(),
  invoiced_at timestamptz,
  paid_at timestamptz,
  waived_at timestamptz,
  waived_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_events_event_type_check check (
    event_type in (
      'completed_job',
      'edi_submission',
      'payment_transaction',
      'adjustment'
    )
  ),
  constraint billing_events_status_check check (
    status in ('pending', 'invoiced', 'paid', 'waived', 'void')
  )
);

alter table public.billing_events
  add column if not exists paid_at timestamptz;

create index if not exists billing_events_account_idx
  on public.billing_events (account_id, occurred_at desc);

create index if not exists billing_events_job_idx
  on public.billing_events (job_id);

create table if not exists public.account_payment_methods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  method_type text not null,
  nickname text,
  status text not null default 'active',
  is_default boolean not null default false,
  card_brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  bank_name text,
  routing_last4 text,
  external_payment_method_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_payment_methods_type_check check (
    method_type in ('card', 'ach')
  ),
  constraint account_payment_methods_status_check check (
    status in ('active', 'disabled')
  )
);

create index if not exists account_payment_methods_account_idx
  on public.account_payment_methods (account_id, is_default desc, created_at desc);

drop trigger if exists set_account_payment_methods_updated_at on public.account_payment_methods;
create trigger set_account_payment_methods_updated_at
before update on public.account_payment_methods
for each row execute procedure public.set_updated_at();

alter table public.account_payment_methods enable row level security;

drop policy if exists "Allow active admins read payment methods" on public.account_payment_methods;
create policy "Allow active admins read payment methods"
on public.account_payment_methods
for select
using (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role in ('admin', 'demo')
  )
);

drop policy if exists "Allow active admins create payment methods" on public.account_payment_methods;
create policy "Allow active admins create payment methods"
on public.account_payment_methods
for insert
with check (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'admin'
  )
);

drop policy if exists "Allow active admins update payment methods" on public.account_payment_methods;
create policy "Allow active admins update payment methods"
on public.account_payment_methods
for update
using (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'admin'
  )
);

drop policy if exists "Allow active admins delete payment methods" on public.account_payment_methods;
create policy "Allow active admins delete payment methods"
on public.account_payment_methods
for delete
using (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'admin'
  )
);

drop trigger if exists set_billing_events_updated_at on public.billing_events;
create trigger set_billing_events_updated_at
before update on public.billing_events
for each row execute procedure public.set_updated_at();

alter table public.billing_events enable row level security;

drop policy if exists "Allow active users read billing events" on public.billing_events;
create policy "Allow active users read billing events"
on public.billing_events
for select
using (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and (
        role in ('admin', 'demo')
        or (
          role = 'shop'
          and user_roles.account_id = billing_events.account_id
        )
      )
  )
);

drop policy if exists "Allow active admins and shops create billing events" on public.billing_events;
create policy "Allow active admins and shops create billing events"
on public.billing_events
for insert
with check (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and (
        role = 'admin'
        or (
          role = 'shop'
          and user_roles.account_id = billing_events.account_id
        )
      )
  )
);

drop policy if exists "Allow admins update billing events" on public.billing_events;
create policy "Allow admins update billing events"
on public.billing_events
for update
using (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'admin'
  )
);
