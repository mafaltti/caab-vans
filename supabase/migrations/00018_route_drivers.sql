-- Migration: Create route_drivers table and backfill from van_drivers
-- Spec: 067-route-driver-assignment

CREATE TABLE route_drivers (
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route_id, driver_id)
);

CREATE INDEX idx_route_drivers_driver ON route_drivers (driver_id);

ALTER TABLE route_drivers ENABLE ROW LEVEL SECURITY;

-- Backfill: copy van_drivers assignments to route_drivers via routes.van_id
INSERT INTO route_drivers (route_id, driver_id)
SELECT r.id, vd.driver_id
FROM van_drivers vd
JOIN routes r ON r.van_id = vd.van_id;
