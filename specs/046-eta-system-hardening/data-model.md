# Data Model: ETA System Hardening

**Feature**: 046-eta-system-hardening
**Date**: 2026-03-06

## Schema Changes

### schedule_entries (existing table — add column)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `osrm_distance_m` | float | yes | null | Pre-computed OSRM road distance (meters) from this stop to the next stop in route sequence. Used by `buildRecentRuns()` to align runtime congestion factor with training script. Null means not yet computed or OSRM was unavailable. |

**Migration**: `ALTER TABLE schedule_entries ADD COLUMN osrm_distance_m double precision;`

**Population**: A one-time script queries OSRM for each consecutive stop pair on each route and updates the column. Can be re-run if stops change.

---

## Entities (no schema changes, behavioral changes only)

### ETA Computation

The core `computeEta()` function gains these behavioral changes:

- **Hysteresis**: When `speedMps < MIN_SPEED_MPS` but a recent ping (within 60s) had speed >= 1.0 m/s, the GPS branch stays active using `FALLBACK_SPEED_MPS`.
- **Speed smoothing**: `computeSmoothedSpeed()` switches from arithmetic mean to median.
- **Direction detection**: In the haversine fallback path, if `headingDeg` is available and bearing difference to stop > 90 degrees, falls back to schedule.

### VanPosition Interface (add optional field)

| Field | Type | Description |
|-------|------|-------------|
| `headingDeg` | `number \| null` (optional) | Van's GPS heading in degrees (0-360). Used for direction detection in haversine fallback. |

### RecentPing (new interface for hysteresis)

| Field | Type | Description |
|-------|------|-------------|
| `speedMps` | `number` | GPS speed at ping time |
| `deviceTs` | `string` | ISO timestamp from device |

Passed to `computeEta()` instead of bare `number[]` for `recentSpeeds`, so the function can check timestamps for the grace period.

### timeFactor Blending

`getTimeFactor()` adds a minimum sample gate: `recentRuns.length >= 3` before blending. With fewer segments, returns only the historical factor.

### buildRecentRuns

Accepts optional pre-computed OSRM distances (from `schedule_entries.osrm_distance_m`). When available, uses OSRM distance instead of `haversine * ROAD_FACTOR`.

---

## Constants (unified/documented)

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `REFERENCE_SPEED_MPS` | 8.3 | `time-factors.ts`, `compute-time-factors.ts` | ~30 km/h, typical urban van speed. Used for congestion factor baseline predictions. |
| `FALLBACK_SPEED_MPS` | 4.2 | `eta.ts` | ~15 km/h, urban crawling speed estimate. Used when van is stationary but GPS branch is active (proximity or hysteresis). |
| `MIN_SPEED_MPS` | 1.0 | `eta.ts` | Movement threshold. Below this, van is considered stationary. |
| `HYSTERESIS_WINDOW_S` | 60 | `eta.ts` | Grace period: keep GPS-based ETA active for 60s after speed drops below threshold. |
| `MIN_BLEND_SEGMENTS` | 3 | `time-factors.ts` | Minimum recent-run segments before blending into congestion factor. |
| `DIRECTION_THRESHOLD_DEG` | 90 | `eta.ts` | Angular difference threshold for direction detection. |

---

## Data Flow Changes

```
API request
  |
  v
Query van_location_pings (speed_mps + device_ts)  <-- added device_ts
  |
  v
Query schedule_entries (includes osrm_distance_m)  <-- new column
  |
  v
computeEta()
  |-- Hysteresis check (using device_ts from recent pings)
  |-- Speed smoothing (median instead of mean)
  |-- Direction detection (using headingDeg in haversine fallback)
  |-- timeFactor blending (N>=3 gate)
  |-- buildRecentRuns (using osrm_distance_m when available)
  |
  v
ETA result (etaSource: "gps" | "gps_osrm" | "schedule")
```
