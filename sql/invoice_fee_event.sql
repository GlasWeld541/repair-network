-- The $0.35 invoice fee (roadmap v2.11, Shiloh 10/9): Field and Pro techs pay $0.35 for each
-- invoice they generate in Rex, on any job, counted per month and billed as ONE fee, never one
-- charge per invoice (a single $0.35 card charge costs about as much in card fees as it brings in).
-- The monthly invoice run (1st of the month) writes one 'invoice_fee' billing event per account for
-- the previous month's Rex invoices; the auto-charge run (5th) collects it with the other fees.
alter table network.billing_events drop constraint if exists billing_events_event_type_check;
alter table network.billing_events add constraint billing_events_event_type_check check (
  event_type = any (array[
    'completed_job', 'edi_submission', 'payment_transaction', 'platform_revenue_share',
    'processor_revenue_share', 'adjustment', 'invoice_fee'
  ])
);
