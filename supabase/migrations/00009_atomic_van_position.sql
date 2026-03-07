-- 1. Add last_gps_fix_at column to vans
ALTER TABLE vans ADD COLUMN last_gps_fix_at timestamptz;

-- 2. Backfill from van_location_pings
UPDATE vans
SET last_gps_fix_at = sub.max_ts
FROM (
  SELECT van_id, MAX(device_ts) AS max_ts
  FROM van_location_pings
  GROUP BY van_id
) sub
WHERE vans.id = sub.van_id;

-- 3. Atomic RPC for van position updates
CREATE OR REPLACE FUNCTION update_van_position(
  p_van_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_accuracy_m DOUBLE PRECISION,
  p_speed_mps DOUBLE PRECISION,
  p_heading_deg DOUBLE PRECISION,
  p_snapped_lat DOUBLE PRECISION,
  p_snapped_lng DOUBLE PRECISION,
  p_device_ts TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE vans
  SET
    last_lat = p_lat,
    last_lng = p_lng,
    last_accuracy_m = p_accuracy_m,
    last_speed_mps = p_speed_mps,
    last_heading_deg = p_heading_deg,
    snapped_lat = p_snapped_lat,
    snapped_lng = p_snapped_lng,
    last_gps_fix_at = p_device_ts,
    location_updated_at = NOW()
  WHERE id = p_van_id
    AND (last_gps_fix_at IS NULL OR p_device_ts > last_gps_fix_at);

  RETURN FOUND;
END;
$$;
