-- Soft-disable for network accounts.
--
-- Derek's beta workflow needs to turn a shop on/off in the network without losing its
-- record (so a shop that leaves can be reactivated if it rejoins). A disabled account
-- stays in the system for history but is excluded from routing/assignment.
--
-- `active = true` (default) → in-network; `active = false` → disabled/deactivated.
alter table network.accounts
  add column if not exists active boolean not null default true;
