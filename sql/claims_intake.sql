create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.carrier_organizations
  add column if not exists claim_submission_enabled boolean not null default true,
  add column if not exists edi_enabled boolean not null default false,
  add column if not exists edi_sender_id text,
  add column if not exists edi_notes text;

create table if not exists public.carrier_claim_routing_rules (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carrier_organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  rule_name text,
  state text,
  postal_prefix text,
  priority integer not null default 100,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carrier_claim_routing_rules_carrier_idx
  on public.carrier_claim_routing_rules (carrier_id, active, priority);

drop trigger if exists set_carrier_claim_routing_rules_updated_at on public.carrier_claim_routing_rules;
create trigger set_carrier_claim_routing_rules_updated_at
before update on public.carrier_claim_routing_rules
for each row execute procedure public.set_updated_at();

create table if not exists public.claim_intakes (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carrier_organizations(id) on delete cascade,
  submitted_by_email text,
  source text not null default 'manual',
  intake_status text not null default 'received',
  carrier_visible_status text not null default 'Received',
  assignment_status text not null default 'Needs Review',
  assigned_account_id uuid references public.accounts(id) on delete set null,
  assigned_job_id uuid,
  claim_number text,
  policy_number text,
  loss_date date,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_vin text,
  damage_type text,
  damage_notes text,
  loss_street text,
  loss_city text,
  loss_state text,
  loss_postal_code text,
  loss_latitude numeric,
  loss_longitude numeric,
  preferred_contact_method text,
  raw_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_intakes_source_check check (
    source in ('manual', 'edi', 'api')
  ),
  constraint claim_intakes_intake_status_check check (
    intake_status in ('received', 'assigned', 'in_progress', 'submitted', 'completed', 'canceled')
  ),
  constraint claim_intakes_assignment_status_check check (
    assignment_status in ('Needs Review', 'Auto Assigned', 'Manually Assigned', 'Declined')
  )
);

alter table public.claim_intakes
  add column if not exists assigned_job_id uuid,
  add column if not exists carrier_visible_status text not null default 'Received',
  add column if not exists loss_latitude numeric,
  add column if not exists loss_longitude numeric;

create index if not exists claim_intakes_carrier_idx
  on public.claim_intakes (carrier_id, created_at desc);

create index if not exists claim_intakes_job_idx
  on public.claim_intakes (assigned_job_id);

drop trigger if exists set_claim_intakes_updated_at on public.claim_intakes;
create trigger set_claim_intakes_updated_at
before update on public.claim_intakes
for each row execute procedure public.set_updated_at();

create table if not exists public.claim_status_events (
  id uuid primary key default gen_random_uuid(),
  claim_intake_id uuid not null references public.claim_intakes(id) on delete cascade,
  event_type text not null,
  visible_to_carrier boolean not null default true,
  note text,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists claim_status_events_claim_idx
  on public.claim_status_events (claim_intake_id, created_at desc);

alter table public.jobs
  add column if not exists claim_intake_id uuid,
  add column if not exists carrier_id uuid,
  add column if not exists claim_source text;

alter table public.claim_intakes enable row level security;
alter table public.claim_status_events enable row level security;
alter table public.carrier_claim_routing_rules enable row level security;

drop policy if exists "Allow admins and matching carriers read claims" on public.claim_intakes;
create policy "Allow admins and matching carriers read claims"
on public.claim_intakes
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
          role = 'carrier'
          and user_roles.carrier_id = claim_intakes.carrier_id
        )
      )
  )
);

drop policy if exists "Allow matching carriers submit claims" on public.claim_intakes;
create policy "Allow matching carriers submit claims"
on public.claim_intakes
for insert
with check (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'carrier'
      and user_roles.carrier_id = claim_intakes.carrier_id
  )
);

drop policy if exists "Allow admins update claims" on public.claim_intakes;
create policy "Allow admins update claims"
on public.claim_intakes
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

drop policy if exists "Allow assigned shops update claim status" on public.claim_intakes;
create policy "Allow assigned shops update claim status"
on public.claim_intakes
for update
using (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'shop'
      and user_roles.account_id = claim_intakes.assigned_account_id
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and approved = true
      and access_status = 'Active'
      and role = 'shop'
      and user_roles.account_id = claim_intakes.assigned_account_id
  )
);

drop policy if exists "Allow admins read routing rules" on public.carrier_claim_routing_rules;
create policy "Allow admins read routing rules"
on public.carrier_claim_routing_rules
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

drop policy if exists "Allow admins manage routing rules" on public.carrier_claim_routing_rules;
create policy "Allow admins manage routing rules"
on public.carrier_claim_routing_rules
for all
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

drop policy if exists "Allow admins and matching carriers read claim events" on public.claim_status_events;
create policy "Allow admins and matching carriers read claim events"
on public.claim_status_events
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
          role = 'carrier'
          and claim_status_events.visible_to_carrier = true
          and exists (
            select 1
            from public.claim_intakes
            where claim_intakes.id = claim_status_events.claim_intake_id
              and claim_intakes.carrier_id = user_roles.carrier_id
          )
        )
      )
  )
);

drop policy if exists "Allow admins create claim events" on public.claim_status_events;
create policy "Allow admins create claim events"
on public.claim_status_events
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

drop policy if exists "Allow assigned shops create claim events" on public.claim_status_events;
create policy "Allow assigned shops create claim events"
on public.claim_status_events
for insert
with check (
  exists (
    select 1
    from public.claim_intakes
    join public.user_roles on user_roles.account_id = claim_intakes.assigned_account_id
    where claim_intakes.id = claim_status_events.claim_intake_id
      and lower(user_roles.user_email) = lower(auth.jwt() ->> 'email')
      and user_roles.approved = true
      and user_roles.access_status = 'Active'
      and user_roles.role = 'shop'
  )
);
