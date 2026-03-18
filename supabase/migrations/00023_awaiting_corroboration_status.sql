-- Add 'awaiting_corroboration' status for geofence events that matched a stop
-- and are head-of-line, but need GPS confirmation before marking the stop as
-- passed.  Distinct from 'deferred' (blocked by contiguous-prefix guard) and
-- 'matched' (fully confirmed).

ALTER TABLE tracking_geofence_events
  DROP CONSTRAINT IF EXISTS tracking_geofence_events_status_check;

ALTER TABLE tracking_geofence_events
  ADD CONSTRAINT tracking_geofence_events_status_check
    CHECK (status IN ('received', 'matched', 'no_match', 'deferred', 'awaiting_corroboration'));
