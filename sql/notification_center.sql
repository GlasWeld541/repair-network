-- In-app notification centre (Nayab raised it on the 2026-09-15 call: "there's going to be a lot of
-- emails... I want to do a notification center").
--
-- Six things now send email — job request, provider declined, acceptance window expired, job not
-- repairable, customer matched, certificate earned — and none of them leave a trace inside the apps.
-- An admin or provider who misses the email has no way to catch up.
--
-- Deliberately NOT a new table: network.notification_events already exists, already carries
-- event_type / audience / subject / body / job_id / account_id / consumer_intake_id, and already has
-- 52 real rows written by the consumer-intake routes. So this reuses it as the feed and adds the two
-- things it lacks: a way for a provider to see their own, and per-person read state.

-- 1. Providers can read their OWN account's notifications. Admins keep the existing all-access
--    policy; nothing else changes, so a provider can never see admin or other accounts' rows.
drop policy if exists notification_events_shop_select on network.notification_events;
create policy notification_events_shop_select on network.notification_events
  for select
  using (
    audience = 'account'
    and account_id is not null
    and account_id = (select network.current_shop_account_id())
  );

-- 2. Read state, per person. A separate table rather than a `read_at` column because an admin
--    notification is seen by SEVERAL people — one admin reading it must not mark it read for
--    everyone else.
create table if not exists network.notification_reads (
  notification_id uuid not null references network.notification_events(id) on delete cascade,
  user_email      text not null,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_email)
);

alter table network.notification_reads enable row level security;

-- You may only see and write your own read marks.
drop policy if exists notification_reads_own on network.notification_reads;
create policy notification_reads_own on network.notification_reads
  for all
  using (lower(user_email) = lower(coalesce(auth.email(), '')))
  with check (lower(user_email) = lower(coalesce(auth.email(), '')));

grant select, insert, delete on network.notification_reads to authenticated;
grant select, insert, update, delete on network.notification_reads to service_role;

-- 3. The feed is always "newest first, for one audience", and the unread count joins on reads.
create index if not exists notification_events_audience_created_idx
  on network.notification_events (audience, created_at desc);

create index if not exists notification_events_account_created_idx
  on network.notification_events (account_id, created_at desc)
  where account_id is not null;

create index if not exists notification_reads_user_idx
  on network.notification_reads (user_email);
