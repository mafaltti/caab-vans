-- 00020_stop_exceptions.sql
-- Add skip-stop, detour mode, and audit trail support
-- Feature: 068-driver-workflow-v1

-- 1. Extend route_run_stops.status CHECK to include 'skipped'
ALTER TABLE route_run_stops DROP CONSTRAINT route_run_stops_status_check;
ALTER TABLE route_run_stops ADD CONSTRAINT route_run_stops_status_check
  CHECK (status IN ('pending', 'passed', 'skipped'));

-- 2. Add exception metadata columns to route_run_stops
ALTER TABLE route_run_stops
  ADD COLUMN reason_code text,
  ADD COLUMN note text,
  ADD COLUMN acted_by uuid,
  ADD COLUMN acted_at timestamptz;

-- 3. Create route_run_events table (immutable audit log)
CREATE TABLE route_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'stop_skipped',
      'detour_started',
      'detour_ended'
    )),
  schedule_entry_id uuid REFERENCES schedule_entries(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  reason_code text,
  note text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_run_events_run ON route_run_events (run_id, created_at);
CREATE INDEX idx_route_run_events_type ON route_run_events (event_type);

-- 4. Add detour state and skipped-stops flag to route_runs
ALTER TABLE route_runs
  ADD COLUMN is_detour_active boolean NOT NULL DEFAULT false,
  ADD COLUMN detour_reason_code text,
  ADD COLUMN detour_note text,
  ADD COLUMN has_skipped_stops boolean NOT NULL DEFAULT false;

-- 5. Enable RLS on route_run_events (service-role only, no anon policies)
ALTER TABLE route_run_events ENABLE ROW LEVEL SECURITY;
