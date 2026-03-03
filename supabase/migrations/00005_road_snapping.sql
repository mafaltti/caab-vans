-- Road snapping: store OSRM-corrected GPS coordinates on the vans table.
-- Raw GPS remains in last_lat/last_lng; snapped values are NULL when
-- OSRM is unavailable or returns no match.
ALTER TABLE vans
  ADD COLUMN snapped_lat double precision,
  ADD COLUMN snapped_lng double precision;
