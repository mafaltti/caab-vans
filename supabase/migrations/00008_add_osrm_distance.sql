-- Add pre-computed OSRM road distance column to schedule_entries.
-- Used by buildRecentRuns() to align runtime congestion factor with training script.
ALTER TABLE schedule_entries ADD COLUMN osrm_distance_m double precision;
