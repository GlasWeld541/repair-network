create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.claim_intakes
  add column if not exists duplicate_warning boolean not null default false,
  add column if not exists duplicate_of_claim_id uuid,
  add column if not exists duplicate_reason text;

create table if not exists public.claim_routing_audits (
  id uuid primary key default gen_random_uuid(),
  claim_intake_id uuid not null references public.claim_intakes(id) on delete cascade,
  routing_method text not null,
  selected_account_id uuid references public.accounts(id) on delete set null,
  selected_distance_miles numeric,
  candidate_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  constraint claim_routing_audits_method_check check (
    routing_method in ('nearest_greenlit', 'fallback_rule', 'admin_review', 'manual_override')
  )
);

create index if not exists claim_routing_audits_claim_idx
  on public.claim_routing_audits (claim_intake_id, created_at desc);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  audience text not null,
  claim_intake_id uuid references public.claim_intakes(id) on delete cascade,
  job_id uuid,
  account_id uuid references public.accounts(id) on delete set null,
  carrier_id uuid references public.carrier_organizations(id) on delete set null,
  recipient_email text,
  status text not null default 'pending',
  subject text,
  body text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_events_status_check check (
    status in ('pending', 'sent', 'failed', 'skipped')
  ),
  constraint notification_events_audience_check check (
    audience in ('admin', 'shop', 'carrier', 'billing', 'customer')
  )
);

create index if not exists notification_events_claim_idx
  on public.notification_events (claim_intake_id, created_at desc);

create index if not exists notification_events_status_idx
  on public.notification_events (status, created_at desc);

create table if not exists public.claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_intake_id uuid not null references public.claim_intakes(id) on delete cascade,
  uploaded_by_email text,
  document_type text not null default 'other',
  file_name text not null,
  file_url text not null,
  visible_to_carrier boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists claim_documents_claim_idx
  on public.claim_documents (claim_intake_id, created_at desc);

alter table public.claim_routing_audits enable row level security;
alter table public.notification_events enable row level security;
alter table public.claim_documents enable row level security;

drop policy if exists "Allow admins read routing audits" on public.claim_routing_audits;
create policy "Allow admins read routing audits"
on public.claim_routing_audits
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

drop policy if exists "Allow admins create routing audits" on public.claim_routing_audits;
create policy "Allow admins create routing audits"
on public.claim_routing_audits
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

drop policy if exists "Allow admins read notification events" on public.notification_events;
create policy "Allow admins read notification events"
on public.notification_events
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

drop policy if exists "Allow admins create notification events" on public.notification_events;
create policy "Allow admins create notification events"
on public.notification_events
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

drop policy if exists "Allow claim parties read documents" on public.claim_documents;
create policy "Allow claim parties read documents"
on public.claim_documents
for select
using (
  exists (
    select 1
    from public.claim_intakes
    join public.user_roles on (
      user_roles.role in ('admin', 'demo')
      or (
        user_roles.role = 'carrier'
        and user_roles.carrier_id = claim_intakes.carrier_id
        and claim_documents.visible_to_carrier = true
      )
      or (
        user_roles.role = 'shop'
        and user_roles.account_id = claim_intakes.assigned_account_id
      )
    )
    where claim_intakes.id = claim_documents.claim_intake_id
      and lower(user_roles.user_email) = lower(auth.jwt() ->> 'email')
      and user_roles.approved = true
      and user_roles.access_status = 'Active'
  )
);

drop policy if exists "Allow claim parties create documents" on public.claim_documents;
create policy "Allow claim parties create documents"
on public.claim_documents
for insert
with check (
  exists (
    select 1
    from public.claim_intakes
    join public.user_roles on (
      user_roles.role = 'admin'
      or (
        user_roles.role = 'carrier'
        and user_roles.carrier_id = claim_intakes.carrier_id
      )
      or (
        user_roles.role = 'shop'
        and user_roles.account_id = claim_intakes.assigned_account_id
      )
    )
    where claim_intakes.id = claim_documents.claim_intake_id
      and lower(user_roles.user_email) = lower(auth.jwt() ->> 'email')
      and user_roles.approved = true
      and user_roles.access_status = 'Active'
  )
);
