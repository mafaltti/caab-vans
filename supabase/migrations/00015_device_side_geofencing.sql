-- Add device-side geofencing support: new pass_source value, schedule_entries
-- columns for config versioning, and tracking_geofence_events ledger table.

-- 1. Extend pass_source CHECK constraint to include 'device_geofence'
ALTER TABLE route_run_stops
  DROP CONSTRAINT IF EXISTS route_run_stops_pass_source_check;

ALTER TABLE route_run_stops
  ADD CONSTRAINT route_run_stops_pass_source_check
    CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual', 'device_geofence'));

-- 2. Add device_geofence_radius_m to schedule_entries (per-stop override)
ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS device_geofence_radius_m integer;

-- 3. Add updated_at to schedule_entries for configVersion computation
ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_schedule_entries_updated_at
  BEFORE UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Create tracking_geofence_events ledger table
CREATE TABLE tracking_geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id uuid NOT NULL REFERENCES vans(id),
  event_id text NOT NULL,
  place_id text NOT NULL,
  entered_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  matched_run_id uuid REFERENCES route_runs(id),
  matched_schedule_entry_id uuid REFERENCES schedule_entries(id),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'matched', 'no_match')),
  UNIQUE (van_id, event_id)
);

CREATE INDEX idx_tge_van_status ON tracking_geofence_events (van_id, status);
