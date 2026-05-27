alter table public.accounts
  add column if not exists claim_routing_enabled boolean not null default true,
  add column if not exists claim_routing_paused_reason text,
  add column if not exists claim_capacity_daily integer,
  add column if not exists claim_capacity_weekly integer;

alter table public.accounts
  alter column claim_routing_enabled set default true;
