-- REX-19 — indexes for the admin intake queue once it counts and paginates server-side.
--
-- Moving the queue into the database traded one unbounded fetch for a page query plus six
-- exact head-counts. That is only a win if the counts are indexed; otherwise each page load
-- buys six sequential scans. consumer_intakes already covers the ordering and the "new"
-- count (created_at DESC, and (intake_status, triage_result, routing_status)). These two
-- close the gap:
--
--   * lead_type        -> the Consumer / Agent metrics
--   * "needs review"   -> unassigned and still serviceable. Partial, so the index only ever
--                         holds the live queue rather than every intake ever taken.
--
-- Pure additions: no behaviour or data change. Instant at current size (~74 rows).

create index if not exists consumer_intakes_lead_type_idx
  on network.consumer_intakes (lead_type);

create index if not exists consumer_intakes_needs_review_idx
  on network.consumer_intakes (created_at desc)
  where assigned_job_id is null and intake_status <> 'not_serviceable';
