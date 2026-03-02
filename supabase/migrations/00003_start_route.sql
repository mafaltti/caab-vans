-- Migration: 00003_start_route
-- Add driver assignment to vans and route lifecycle timestamps to route_runs

ALTER TABLE vans
  ADD COLUMN driver_id uuid;

ALTER TABLE route_runs
  ADD COLUMN started_at timestamptz,
  ADD COLUMN ended_at   timestamptz;
