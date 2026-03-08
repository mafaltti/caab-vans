# Data Model: Progress Pointer Correctness Fixes

**Date**: 2026-03-08

## Existing Entities (No Schema Changes)

This feature modifies **behavior only** — no database migrations or schema changes are required.

### schedule_entries

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| route_id | uuid | FK → routes |
| stop_name | text | |
| time | text | HH:mm format |
| stop_lat | float8 | nullable |
| stop_lng | float8 | nullable |
| geofence_radius_m | float8 | default 50 |
| osrm_distance_m | float8 | nullable; distance to immediate successor |

**Used by**: FR-001 (multi-segment accumulation sums `osrm_distance_m` across consecutive entries).

### route_runs

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| route_id | uuid | FK → routes |
| service_date | date | |
| started_at | timestamptz | nullable |
| ended_at | timestamptz | nullable |
| next_stop_id | uuid | nullable; FK → schedule_entries |
| progress_updated_at | timestamptz | nullable |

**Used by**: FR-002/003/004 (pointer source, staleness checks).

### route_run_stops

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| route_run_id | uuid | FK → route_runs |
| schedule_entry_id | uuid | FK → schedule_entries |
| status | text | "pending" or "passed" |
| passed_at | timestamptz | nullable |
| pass_source | text | nullable; "geofence_raw" or "geofence_snapped" |
| pass_confidence | float8 | nullable; 0.0–1.0 |

**Used by**: FR-006/007/008 (snap decision, confidence, backfill).

### van_location_pings

| Field | Type | Notes |
|-------|------|-------|
| van_id | uuid | FK → vans |
| lat | float8 | raw GPS latitude |
| lng | float8 | raw GPS longitude |
| device_ts | timestamptz | device timestamp |

**Used by**: FR-007 (confidence ping query — uses raw pings; snapped-passage confidence capped at 0.8 to account for coordinate-source mismatch).

## New Constants (Code-Level)

| Constant | File | Value | Purpose |
|----------|------|-------|---------|
| `POINTER_ABSOLUTE_CEILING_MINUTES` | `src/lib/time.ts` | 120 | FR-004: max age for stale-but-pending pointer |

## State Transitions

### Pointer Validation (Modified)

```
Pointer received from route_runs.next_stop_id
  │
  ├── Does not exist in schedule → INVALID (fall back to route order)
  ├── Stop already passed → INVALID (fall back to route order)
  ├── Age < 30 min → FRESH (use directly)
  ├── Age 30 min – 2 hours, stop pending → STALE-BUT-VALID (use as target)
  └── Age > 2 hours → EXPIRED (fall back to route order)
```

### ETA Source Selection (Modified)

```
Has fresh GPS position?
  ├── Yes → GPS-based ETA (gps / gps_osrm)
  └── No → Segment fallback
           ├── Target is immediate successor? → Use single segment distance
           ├── Target is N stops ahead, all segments present? → Sum N segment distances
           ├── Target is N stops ahead, any segment missing? → Schedule fallback
           └── No segment data at all → Schedule fallback
```
