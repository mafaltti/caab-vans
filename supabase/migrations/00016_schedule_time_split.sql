-- Migration: Schedule Time Split
-- Adds arrival_time, departure_time, stop_sequence to schedule_entries
-- Bidirectional dual-write trigger keeps legacy `time` in sync during transition

BEGIN;

-- 1. Add new columns (nullable initially for backfill)
ALTER TABLE schedule_entries
  ADD COLUMN stop_sequence integer,
  ADD COLUMN arrival_time time,
  ADD COLUMN departure_time time;

-- 2. Backfill from existing `time` column
UPDATE schedule_entries
SET
  arrival_time = time,
  departure_time = time,
  stop_sequence = sub.seq
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY time) AS seq
  FROM schedule_entries
) sub
WHERE schedule_entries.id = sub.id;

-- 3. Set NOT NULL after backfill
ALTER TABLE schedule_entries
  ALTER COLUMN stop_sequence SET NOT NULL,
  ALTER COLUMN arrival_time SET NOT NULL,
  ALTER COLUMN departure_time SET NOT NULL;

-- 4. Add CHECK constraint: departure must not be before arrival
ALTER TABLE schedule_entries
  ADD CONSTRAINT chk_departure_gte_arrival
  CHECK (departure_time >= arrival_time);

-- 5. Drop old unique constraint and index, create new ones
ALTER TABLE schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_route_id_time_key;
DROP INDEX IF EXISTS idx_schedule_entries_route_time;

ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_route_id_stop_sequence_key
  UNIQUE (route_id, stop_sequence);

CREATE INDEX idx_schedule_entries_route_sequence
  ON schedule_entries (route_id, stop_sequence);

-- 6. Bidirectional dual-write trigger
--    - If new fields are written (arrival_time/departure_time), sync to `time` (= arrival_time)
--    - If only `time` is written (legacy path), sync to arrival_time/departure_time
--    - Auto-assign stop_sequence on INSERT if not provided
CREATE OR REPLACE FUNCTION sync_schedule_time_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- If new fields provided, sync legacy time from arrival
    IF NEW.arrival_time IS NOT NULL THEN
      NEW.time := COALESCE(NEW.time, NEW.arrival_time);
      NEW.departure_time := COALESCE(NEW.departure_time, NEW.arrival_time);
    -- If only legacy time provided, sync new fields from it
    ELSIF NEW.time IS NOT NULL THEN
      NEW.arrival_time := NEW.time;
      NEW.departure_time := COALESCE(NEW.departure_time, NEW.time);
    END IF;
    -- Auto-assign stop_sequence if not provided
    IF NEW.stop_sequence IS NULL THEN
      SELECT COALESCE(MAX(stop_sequence), 0) + 1
        INTO NEW.stop_sequence
        FROM schedule_entries
        WHERE route_id = NEW.route_id;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- New fields changed → sync to legacy time
    IF NEW.arrival_time IS DISTINCT FROM OLD.arrival_time THEN
      NEW.time := NEW.arrival_time;
    -- Legacy time changed → sync to new fields
    ELSIF NEW.time IS DISTINCT FROM OLD.time THEN
      NEW.arrival_time := NEW.time;
      NEW.departure_time := NEW.time;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_schedule_times
  BEFORE INSERT OR UPDATE ON schedule_entries
  FOR EACH ROW
  EXECUTE FUNCTION sync_schedule_time_fields();

COMMIT;
