# Data Model: Live Tracking Ingestion

## Schema Changes

### Extended Tables

#### `vans` (existing — add columns)

| Column           | Type             | Nullable | Default | Notes                             |
|------------------|------------------|----------|---------|-----------------------------------|
| `last_lat`       | DOUBLE PRECISION | Yes      | —       | Latest GPS latitude               |
| `last_lng`       | DOUBLE PRECISION | Yes      | —       | Latest GPS longitude              |
| `last_accuracy_m`| DOUBLE PRECISION | Yes      | —       | Horizontal accuracy (meters)      |
| `last_speed_mps` | DOUBLE PRECISION | Yes      | —       | Speed (meters/second)             |
| `last_heading_deg`| DOUBLE PRECISION| Yes      | —       | Heading (degrees, 0-360)          |

Reuses existing `location_updated_at` column — updated on each ping.

#### `schedule_entries` (existing — add columns)

| Column             | Type             | Nullable | Default | Notes                           |
|--------------------|------------------|----------|---------|---------------------------------|
| `stop_lat`         | DOUBLE PRECISION | Yes      | —       | Stop geofence center latitude   |
| `stop_lng`         | DOUBLE PRECISION | Yes      | —       | Stop geofence center longitude  |
| `geofence_radius_m`| INTEGER         | No       | 50      | Geofence radius (meters)        |

Nullable lat/lng for backward compatibility. Inference skips entries without coordinates.

### New Tables

#### `van_location_pings`

| Column       | Type         | Nullable | Default              | Notes                            |
|--------------|--------------|----------|----------------------|----------------------------------|
| `id`         | UUID         | No       | `gen_random_uuid()`  | Primary key                      |
| `van_id`     | UUID         | No       | —                    | FK → `vans(id)` CASCADE DELETE   |
| `device_id`  | UUID         | No       | —                    | Device identifier (diagnostic)   |
| `lat`        | DOUBLE PRECISION | No   | —                    | WGS84 latitude                   |
| `lng`        | DOUBLE PRECISION | No   | —                    | WGS84 longitude                  |
| `accuracy_m` | DOUBLE PRECISION | Yes  | —                    | Horizontal accuracy (meters)     |
| `speed_mps`  | DOUBLE PRECISION | Yes  | —                    | Speed (meters/second)            |
| `heading_deg`| DOUBLE PRECISION | Yes  | —                    | Heading (degrees, 0-360)         |
| `device_ts`  | TIMESTAMPTZ  | No       | —                    | Device timestamp (from app)      |
| `received_at`| TIMESTAMPTZ  | No       | `now()`              | Server receive time              |

**Index**: `(van_id, received_at DESC)` — for querying latest pings per van.

#### `route_runs`

| Column       | Type         | Nullable | Default              | Notes                            |
|--------------|--------------|----------|----------------------|----------------------------------|
| `id`         | UUID         | No       | `gen_random_uuid()`  | Primary key                      |
| `route_id`   | UUID         | No       | —                    | FK → `routes(id)` CASCADE DELETE |
| `service_date`| DATE        | No       | —                    | The calendar date of the run     |
| `created_at` | TIMESTAMPTZ  | No       | `now()`              | Record creation time             |
| `updated_at` | TIMESTAMPTZ  | No       | `now()`              | Auto-updated via trigger         |

**Unique constraint**: `(route_id, service_date)` — one run per route per day.
**Trigger**: `set_updated_at()` on UPDATE (reuses existing trigger function).

#### `route_run_stops`

| Column              | Type        | Nullable | Default     | Notes                                |
|---------------------|-------------|----------|-------------|--------------------------------------|
| `run_id`            | UUID        | No       | —           | FK → `route_runs(id)` CASCADE DELETE |
| `schedule_entry_id` | UUID        | No       | —           | FK → `schedule_entries(id)` CASCADE  |
| `status`            | TEXT        | No       | `'pending'` | CHECK: `pending` or `passed`         |
| `passed_at`         | TIMESTAMPTZ | Yes      | —           | When the stop was passed             |

**Primary key**: `(run_id, schedule_entry_id)` — composite.
**Index**: `(run_id, status)` — for querying pending/passed stops efficiently.
**State transitions**: `pending` → `passed` (one-way, irreversible in V1).

## RLS

All new tables have RLS enabled with **no anon policies**. All access is via the service role in BFF route handlers.

| Table                | RLS Enabled | Anon SELECT | Anon INSERT/UPDATE |
|----------------------|-------------|-------------|-------------------|
| `van_location_pings` | Yes         | No          | No                |
| `route_runs`         | Yes         | No          | No                |
| `route_run_stops`    | Yes         | No          | No                |

## Entity Relationships

```
vans (1) ←──── (N) van_location_pings
  │
  └── (1) routes (1) ←──── (N) schedule_entries
                │                    │
                └── (1) route_runs   │
                         │           │
                         └── (N) route_run_stops (N) ──→ (1) schedule_entries
```

## TypeScript Type Extensions

### `Van` type — add fields:

```
last_lat: number | null
last_lng: number | null
last_accuracy_m: number | null
last_speed_mps: number | null
last_heading_deg: number | null
```

### `ScheduleEntry` type — add fields:

```
stop_lat: number | null
stop_lng: number | null
geofence_radius_m: number
```

### New types:

```
VanLocationPing {
  id: string
  van_id: string
  device_id: string
  lat: number
  lng: number
  accuracy_m: number | null
  speed_mps: number | null
  heading_deg: number | null
  device_ts: string
  received_at: string
}

RouteRun {
  id: string
  route_id: string
  service_date: string
  created_at: string
  updated_at: string
}

RouteRunStop {
  run_id: string
  schedule_entry_id: string
  status: "pending" | "passed"
  passed_at: string | null
}
```
