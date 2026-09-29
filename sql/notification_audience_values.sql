-- Allow the notification audiences the apps actually write.
--
-- notification_events_audience_check only allowed admin / shop / carrier / billing. The
-- notification centre (sql/notification_center.sql, 2026-09-21) writes 'account' for a provider's
-- own notifications, and 'customer' for the customer-facing trail, which the original consumer-
-- intake routes also write. Every one of those inserts was rejected by this constraint, and
-- because notifications are best-effort the failure was swallowed: all 57 stored rows were
-- 'admin', and the provider's Rex bell never had anything to show (job requests, certification,
-- payment notices). Found 2026-09-29 by testing the provider payment notifications end to end.
--
-- Additive only: every value allowed before is still allowed. Nothing dispatches from this table,
-- so storing customer rows cannot start sending anything.
alter table network.notification_events drop constraint if exists notification_events_audience_check;
alter table network.notification_events add constraint notification_events_audience_check
  check (audience = any (array['admin', 'shop', 'carrier', 'billing', 'account', 'customer']));

-- Same fix, found in the same test: a provider removing a card in Rex writes status 'removed'
-- (kept as a record rather than deleted, because past charges reference it), but the constraint
-- only allowed active / disabled. So "remove card" failed in production. Additive only.
alter table network.account_payment_methods drop constraint if exists account_payment_methods_status_check;
alter table network.account_payment_methods add constraint account_payment_methods_status_check
  check (status = any (array['active', 'disabled', 'removed']));
