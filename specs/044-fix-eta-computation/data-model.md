# Data Model: Fix ETA Computation

**Feature**: 044-fix-eta-computation
**Date**: 2026-03-06
**Schema changes**: None required

## Existing Entities (No Changes)

### van_location_pings (read-only usage)
Used to query recent speed readings for smoothing. No schema changes.
- `van_id` (uuid) — FK to vans
- `speed_mps` (double precision, nullable) — GPS speed in m/s
- `device_ts` (timestamptz) — device timestamp for ordering
- **Index**: `(van_id, received_at DESC)` — supports efficient recent-pings query

### vans (no changes)
- `last_lat`, `last_lng` — current position
- `last_speed_mps` — instantaneous speed (still written by ingestion, but ETA may use smoothed value instead)
- `location_updated_at` — for staleness checks

### OSRM Route Result (external, no changes)
Already returns `{ distanceMeters, durationSeconds }`. The `durationSeconds` field will now be consumed.

## New Computed Concepts (In-Memory Only)

### SmoothedSpeed
- **Source**: Last 10 rows from `van_location_pings` for the van, ordered by `device_ts DESC`
- **Computation**: Arithmetic mean of non-null `speed_mps` values
- **Fallback**: If fewer than 10 readings exist, use whatever is available
- **Usage**: Replaces instantaneous `speedMps` in the haversine fallback ETA path

### ProximityFallbackSpeed
- **Value**: 4.2 m/s (~15 km/h), constant
- **Usage**: When van speed is 0 and haversine distance to next stop ≤ 500m
- **Replaces**: The current behavior of skipping GPS branch entirely at speed=0

## New Query

### Recent Speed Readings
```sql
SELECT speed_mps
FROM van_location_pings
WHERE van_id = $1
  AND speed_mps IS NOT NULL
ORDER BY device_ts DESC
LIMIT 10;
```
- Expected cost: Index scan on `(van_id, received_at DESC)`, 10 rows max
- Called once per ETA computation (per route detail or route list API call)

## State Transitions

No new state transitions. The ETA computation is stateless — it reads current data and produces a result. The `etaSource` field already supports values: `"gps"`, `"gps_osrm"`, `"schedule"`.
