ALTER TABLE route_runs
  ADD COLUMN last_passed_stop_id uuid
    REFERENCES schedule_entries(id) ON DELETE SET NULL,
  ADD COLUMN next_stop_id uuid
    REFERENCES schedule_entries(id) ON DELETE SET NULL,
  ADD COLUMN progress_updated_at timestamptz;
