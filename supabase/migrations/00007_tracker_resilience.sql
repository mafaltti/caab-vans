-- 00007_tracker_resilience.sql
-- Add health metadata and sequence columns to van_location_pings

ALTER TABLE van_location_pings
  ADD COLUMN seq integer,
  ADD COLUMN buffer_size smallint,
  ADD COLUMN failure_count smallint,
  ADD COLUMN battery_level real,
  ADD COLUMN network_type text;

-- Partial index for sequence gap detection queries
CREATE INDEX idx_van_location_pings_van_seq
  ON van_location_pings (van_id, seq)
  WHERE seq IS NOT NULL;
