-- Migration: Drop legacy time column
-- All code now uses arrival_time, departure_time, stop_sequence.
-- The dual-write trigger and legacy `time` column are no longer needed.

BEGIN;

-- 1. Drop the bidirectional sync trigger
DROP TRIGGER IF EXISTS trg_sync_schedule_times ON schedule_entries;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS sync_schedule_time_fields();

-- 3. Drop the legacy time column
ALTER TABLE schedule_entries DROP COLUMN IF EXISTS time;

COMMIT;
