-- Step 1: Remove existing duplicates (keep earliest id per van_id+device_ts)
DELETE FROM van_location_pings a
  USING van_location_pings b
  WHERE a.van_id = b.van_id
    AND a.device_ts = b.device_ts
    AND a.id > b.id;

-- Step 2: Create unique index (also serves as query index for isNewest)
CREATE UNIQUE INDEX idx_van_location_pings_van_device_ts
  ON van_location_pings (van_id, device_ts);
