-- 00002_live_tracking.sql
-- Live tracking tables: location pings, route runs, route run stops
-- Extends vans and schedule_entries with geolocation columns

-- ============================================================
-- Extend existing tables
-- ============================================================

-- Add GPS position columns to vans
ALTER TABLE vans
  ADD COLUMN last_lat double precision,
  ADD COLUMN last_lng double precision,
  ADD COLUMN last_accuracy_m double precision,
  ADD COLUMN last_speed_mps double precision,
  ADD COLUMN last_heading_deg double precision;

-- Add geofence columns to schedule_entries
ALTER TABLE schedule_entries
  ADD COLUMN stop_lat double precision,
  ADD COLUMN stop_lng double precision,
  ADD COLUMN geofence_radius_m integer NOT NULL DEFAULT 50;

-- ============================================================
-- New tables
-- ============================================================

CREATE TABLE van_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id uuid NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  speed_mps double precision,
  heading_deg double precision,
  device_ts timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_van_location_pings_van_received
  ON van_location_pings (van_id, received_at DESC);

CREATE TABLE route_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, service_date)
);

CREATE TRIGGER trg_route_runs_updated_at
  BEFORE UPDATE ON route_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE route_run_stops (
  run_id uuid NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
  schedule_entry_id uuid NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'passed')),
  passed_at timestamptz,
  PRIMARY KEY (run_id, schedule_entry_id)
);

CREATE INDEX idx_route_run_stops_run_status
  ON route_run_stops (run_id, status);

-- ============================================================
-- RLS (no anon policies — all access via service role in BFF)
-- ============================================================

ALTER TABLE van_location_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_run_stops ENABLE ROW LEVEL SECURITY;
