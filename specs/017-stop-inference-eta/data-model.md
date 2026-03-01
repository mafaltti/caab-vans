# Data Model: Stop Inference, ETA Computation & Tracking UI

**Feature**: `017-stop-inference-eta`
**Date**: 2026-03-01

## Existing Entities (Modified)

### `schedule_entries` — Extended Fields

These columns already exist from migration `00002_live_tracking.sql` but are not yet used by any application code.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `stop_lat` | `double precision` | Yes | `NULL` | Latitude of the stop (WGS84) |
| `stop_lng` | `double precision` | Yes | `NULL` | Longitude of the stop (WGS84) |
| `geofence_radius_m` | `integer` | No | `50` | Geofence radius in meters |

**Validation rules**:
- `stop_lat`: -90 to 90, optional
- `stop_lng`: -180 to 180, optional
- Both must be provided together or both null
- `geofence_radius_m`: uses DB default (50), not exposed in admin UI for V1

### `vans` — Existing Fields (Already Surfaced by Tracking Endpoint)

| Column | Type | Notes |
|--------|------|-------|
| `last_lat` | `double precision` | Latest latitude from tracking ping |
| `last_lng` | `double precision` | Latest longitude from tracking ping |
| `location_updated_at` | `timestamptz` | Updated on each accepted ping |

These exist and are written by the tracking endpoint. This feature adds them to API responses.

## Existing Entities (Used, Not Modified)

### `route_runs`

Already exists from migration `00002_live_tracking.sql`. Not yet used by application code.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `route_id` | `uuid` | No | — | FK → `routes.id` |
| `service_date` | `date` | No | — | The day this run covers |
| `created_at` | `timestamptz` | No | `now()` | |
| `updated_at` | `timestamptz` | No | `now()` | Via `set_updated_at()` trigger |

**Uniqueness**: `(route_id, service_date)` — one run per route per day.

**State transitions**: Created on first ping of the day for a route's van. Never deleted during the day.

### `route_run_stops`

Already exists from migration `00002_live_tracking.sql`. Not yet used by application code.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `run_id` | `uuid` | No | — | FK → `route_runs.id` |
| `schedule_entry_id` | `uuid` | No | — | FK → `schedule_entries.id` |
| `status` | `text` | No | `'pending'` | CHECK: `'pending'` or `'passed'` |
| `passed_at` | `timestamptz` | Yes | `NULL` | Set when status → `'passed'` |

**Primary key**: `(run_id, schedule_entry_id)`.

**State transitions**: `pending` → `passed` (one-way, irreversible within a day's run).

**Lifecycle**: Bulk-inserted as `'pending'` when the parent `route_run` is created. Updated to `'passed'` when inference detects the van within geofence radius.

## No New Schema Changes Required

All tables and columns needed for this feature already exist from migration `00002_live_tracking.sql`. No new migration is needed.

## Computed Types (BFF Response Shapes)

### Extended `RouteWithStatus`

```
RouteWithStatus.van
├── id: string
├── locationUrl: string | null        (existing)
├── locationUpdatedAt: string | null   (existing)
├── isLocationOutdated: boolean        (existing)
├── lastLat: number | null             (NEW)
└── lastLng: number | null             (NEW)
```

### New `RouteProgress` Type

```
RouteProgress (nullable on RouteWithStatus/RouteDetail)
├── serviceDate: string               "YYYY-MM-DD"
├── nextStopId: string | null          Schedule entry ID of next unpassed stop
├── passedStopIds: string[]            Schedule entry IDs of passed stops
├── etaNextStopISO: string | null      ISO 8601 datetime of predicted arrival
├── etaNextStopMinutes: number | null  Ceiling of minutes until predicted arrival
└── delayMinutes: number | null        Delay in minutes at last passed stop
```

### Extended `NextStop` Type

```
NextStop
├── stopName: string     (existing)
├── time: string         (existing, HH:mm)
└── id: string           (NEW — schedule entry ID, eliminates fragile name+time lookup)
```

## Entity Relationship Summary

```
routes 1──1 vans
routes 1──* schedule_entries
routes 1──* route_runs (one per service_date)
route_runs 1──* route_run_stops
route_run_stops *──1 schedule_entries
vans 1──* van_location_pings
```
