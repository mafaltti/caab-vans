-- 00010_drop_seq_column.sql
-- Remove dead sequence counter column and its partial index

DROP INDEX IF EXISTS idx_van_location_pings_van_seq;

ALTER TABLE van_location_pings
  DROP COLUMN IF EXISTS seq;
