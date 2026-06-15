create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

insert into storage.buckets (id, name, public)
values ('consumer-damage-photos', 'consumer-damage-photos', true)
on conflict (id) do nothing;

alter table public.accounts
  add column if not exists consumer_repair_enabled boolean not null default true,
  add column if not exists consumer_replacement_enabled boolean not null default false,
  add column if not exists agent_referral_enabled boolean not null default true,
  add column if not exists consumer_routing_notes text,
  add column if not exists repair_platform_fee_bps integer not null default 300,
  add column if not exists replacement_platform_fee_bps integer not null default 700;

create table if not exists public.consumer_intakes (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null default 'consumer',
  source text not null default 'web',
  intake_status text not null default 'new',
  triage_result text not null default 'needs_review',
  payment_path text not null default 'unknown',
  routing_status text not null default 'needs_review',
  assigned_account_id uuid references public.accounts(id) on delete set null,
  assigned_job_id uuid,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  postal_code text,
  city text,
  state text,
  street text,
  latitude numeric,
  longitude numeric,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_vin text,
  damage_location text,
  damage_size text,
  damage_notes text,
  insurance_carrier text,
  policy_number text,
  claim_number text,
  agent_name text,
  agent_email text,
  agent_phone text,
  preferred_contact_method text,
  landing_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  device text,
  raw_payload jsonb not null default '{}'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumer_intakes_lead_type_check check (
    lead_type in ('consumer', 'agent')
  ),
  constraint consumer_intakes_source_check check (
    source in ('web', 'google_ads', 'organic', 'direct', 'referral', 'agent', 'admin')
  ),
  constraint consumer_intakes_status_check check (
    intake_status in ('new', 'reviewing', 'assigned', 'scheduled', 'completed', 'canceled', 'not_serviceable')
  ),
  constraint consumer_intakes_triage_check check (
    triage_result in ('needs_review', 'repair', 'replacement', 'not_serviceable')
  ),
  constraint consumer_intakes_payment_path_check check (
    payment_path in ('unknown', 'cash', 'insurance')
  ),
  constraint consumer_intakes_routing_status_check check (
    routing_status in ('needs_review', 'auto_assigned', 'manually_assigned', 'declined')
  )
);

alter table public.consumer_intakes
  add column if not exists assigned_job_id uuid,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists device text;

create index if not exists consumer_intakes_created_idx
  on public.consumer_intakes (created_at desc);

create index if not exists consumer_intakes_status_idx
  on public.consumer_intakes (intake_status, triage_result, routing_status);

create index if not exists consumer_intakes_account_idx
  on public.consumer_intakes (assigned_account_id, created_at desc);

drop trigger if exists set_consumer_intakes_updated_at on public.consumer_intakes;
create trigger set_consumer_intakes_updated_at
before update on public.consumer_intakes
for each row execute procedure public.set_updated_at();

create table if not exists public.consumer_intake_photos (
  id uuid primary key default gen_random_uuid(),
  consumer_intake_id uuid not null references public.consumer_intakes(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists consumer_intake_photos_intake_idx
  on public.consumer_intake_photos (consumer_intake_id, created_at);

alter table public.jobs
  add column if not exists consumer_intake_id uuid references public.consumer_intakes(id) on delete set null,
  add column if not exists intake_origin text not null default 'admin',
  add column if not exists service_type text not null default 'repair',
  add column if not exists payment_path text not null default 'unknown',
  add column if not exists platform_fee_bps integer not null default 0,
  add column if not exists platform_fee_cents integer not null default 0,
  add column if not exists platform_fee_status text not null default 'pending',
  add column if not exists marketing_source text,
  add column if not exists marketing_campaign text,
  add column if not exists gclid text,
  add column if not exists landing_page text;

alter table public.jobs
  drop constraint if exists jobs_intake_origin_check,
  add constraint jobs_intake_origin_check check (
    intake_origin in ('consumer', 'agent', 'carrier', 'edi', 'shop', 'admin')
  );

alter table public.jobs
  drop constraint if exists jobs_service_type_check,
  add constraint jobs_service_type_check check (
    service_type in ('repair', 'replacement', 'unknown')
  );

alter table public.jobs
  drop constraint if exists jobs_payment_path_check,
  add constraint jobs_payment_path_check check (
    payment_path in ('unknown', 'cash', 'insurance')
  );

alter table public.jobs
  drop constraint if exists jobs_platform_fee_status_check,
  add constraint jobs_platform_fee_status_check check (
    platform_fee_status in ('pending', 'invoiced', 'paid', 'waived', 'void')
  );

create index if not exists jobs_consumer_intake_idx
  on public.jobs (consumer_intake_id);

alter table public.billing_events
  drop constraint if exists billing_events_event_type_check,
  add constraint billing_events_event_type_check check (
    event_type in (
      'completed_job',
      'edi_submission',
      'payment_transaction',
      'platform_revenue_share',
      'processor_revenue_share',
      'adjustment'
    )
  );

alter table public.consumer_intakes enable row level security;
alter table public.consumer_intake_photos enable row level security;

drop policy if exists "Allow public create consumer intakes" on public.consumer_intakes;
create policy "Allow public create consumer intakes"
on public.consumer_intakes
for insert
with check (true);

drop policy if exists "Allow admins and assigned shops read consumer intakes" on public.consumer_intakes;
create policy "Allow admins and assigned shops read consumer intakes"
on public.consumer_intakes
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
          and user_roles.account_id = consumer_intakes.assigned_account_id
        )
      )
  )
);

drop policy if exists "Allow admins update consumer intakes" on public.consumer_intakes;
create policy "Allow admins update consumer intakes"
on public.consumer_intakes
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

drop policy if exists "Allow public create consumer photos" on public.consumer_intake_photos;
create policy "Allow public create consumer photos"
on public.consumer_intake_photos
for insert
with check (true);

drop policy if exists "Allow admins and assigned shops read consumer photos" on public.consumer_intake_photos;
create policy "Allow admins and assigned shops read consumer photos"
on public.consumer_intake_photos
for select
using (
  exists (
    select 1
    from public.consumer_intakes
    join public.user_roles on (
      user_roles.role in ('admin', 'demo')
      or (
        user_roles.role = 'shop'
        and user_roles.account_id = consumer_intakes.assigned_account_id
      )
    )
    where consumer_intakes.id = consumer_intake_photos.consumer_intake_id
      and lower(user_roles.user_email) = lower(auth.jwt() ->> 'email')
      and user_roles.approved = true
      and user_roles.access_status = 'Active'
  )
);
