-- Add 'deferred' status for geofence events that matched a stop but were
-- blocked by the contiguous-prefix guard (out-of-order arrival).  Distinct
-- from 'no_match' which covers transient errors that the client should retry.

ALTER TABLE tracking_geofence_events
  DROP CONSTRAINT IF EXISTS tracking_geofence_events_status_check;

ALTER TABLE tracking_geofence_events
  ADD CONSTRAINT tracking_geofence_events_status_check
    CHECK (status IN ('received', 'matched', 'no_match', 'deferred'));
