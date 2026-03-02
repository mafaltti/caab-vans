-- Migration: 00004_multi_driver_shifts
-- Multi-driver shift support: van_drivers (many-to-many), route_shifts,
-- data migration from vans.driver_id and route_runs.started_at/ended_at,
-- and column deprecation.

-- ============================================================
-- 1. New tables
-- ============================================================

CREATE TABLE van_drivers (
  van_id uuid NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (van_id, driver_id)
);

CREATE INDEX idx_van_drivers_driver ON van_drivers (driver_id);

CREATE TABLE route_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_shifts_run ON route_shifts (run_id, started_at);
CREATE INDEX idx_route_shifts_driver ON route_shifts (driver_id, started_at DESC);

-- ============================================================
-- 2. RLS (access via service role in BFF, same pattern as other tables)
-- ============================================================

ALTER TABLE van_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_shifts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Migrate existing data
-- ============================================================

-- 3a. Migrate vans.driver_id -> van_drivers
INSERT INTO van_drivers (van_id, driver_id)
SELECT id, driver_id
FROM vans
WHERE driver_id IS NOT NULL;

-- 3b. Migrate route_runs.started_at/ended_at -> route_shifts
INSERT INTO route_shifts (run_id, driver_id, started_at, ended_at, created_at)
SELECT
  rr.id,
  v.driver_id,
  rr.started_at,
  rr.ended_at,
  rr.started_at
FROM route_runs rr
JOIN routes r ON r.id = rr.route_id
JOIN vans v ON v.id = r.van_id
WHERE rr.started_at IS NOT NULL
  AND v.driver_id IS NOT NULL;

-- ============================================================
-- 4. Drop deprecated columns
-- ============================================================

ALTER TABLE vans DROP COLUMN driver_id;
ALTER TABLE route_runs DROP COLUMN started_at;
ALTER TABLE route_runs DROP COLUMN ended_at;
