ALTER TABLE route_run_stops
  ADD COLUMN pass_source text
    CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual')),
  ADD COLUMN pass_confidence numeric
    CHECK (pass_confidence >= 0.0 AND pass_confidence <= 1.0);
