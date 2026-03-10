-- Add per-ping snapped coordinates to van_location_pings
-- These already exist on the vans table (migration 00005).
-- Adding to individual pings supports source-aligned confidence scoring.
ALTER TABLE van_location_pings
  ADD COLUMN snapped_lat double precision,
  ADD COLUMN snapped_lng double precision;
