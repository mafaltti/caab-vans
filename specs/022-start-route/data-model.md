# Data Model: Start Route

## Migration: `00003_start_route.sql`

### Changes to `vans`

```sql
ALTER TABLE vans
  ADD COLUMN driver_id uuid;
```

- Nullable — a van may not have an assigned driver.
- References `auth.users(id)` logically (validated in application code, not via FK to avoid cross-schema dependency issues with Supabase Auth).
- 1:1 relationship: one driver per van. No UNIQUE constraint initially (the app enforces this — a superuser won't assign the same driver to two vans, and the UI validates it).

### Changes to `route_runs`

```sql
ALTER TABLE route_runs
  ADD COLUMN started_at timestamptz,
  ADD COLUMN ended_at   timestamptz;
```

- Both nullable.
- `started_at` is set when the driver explicitly starts the route.
- `ended_at` is set when the driver explicitly ends the route.
- A run can exist without either (created implicitly by GPS pings).

### Derived Run Status

No `status` column — state is derived from timestamps:

| `started_at` | `ended_at` | Derived status   |
|--------------|-----------|------------------|
| `NULL`       | `NULL`    | `waiting`        |
| set          | `NULL`    | `in_progress`    |
| set          | set       | `completed`      |
| `NULL`       | set       | Invalid (prevented by API) |

## Entity Relationship Diagram

```
auth.users (Supabase Auth)
  └── app_metadata: { role: "admin"|"superuser"|"driver", is_active: boolean }

vans
  ├── id (PK)
  ├── name
  ├── driver_id → auth.users (nullable, logical FK)
  ├── ingestion_token (UNIQUE)
  ├── location_url
  ├── location_updated_at
  ├── last_lat, last_lng, last_accuracy_m, last_speed_mps, last_heading_deg
  └── created_at, updated_at

routes
  ├── id (PK)
  ├── name
  ├── van_id → vans (UNIQUE, NOT NULL) [1:1]
  └── created_at, updated_at

route_runs
  ├── id (PK)
  ├── route_id → routes (ON DELETE CASCADE)
  ├── service_date (date)
  ├── started_at (timestamptz, nullable)  ← NEW
  ├── ended_at (timestamptz, nullable)    ← NEW
  ├── created_at, updated_at
  └── UNIQUE (route_id, service_date)

route_run_stops
  ├── (run_id, schedule_entry_id) (composite PK)
  ├── status: "pending" | "passed"
  └── passed_at (timestamptz, nullable)

schedule_entries
  ├── id (PK)
  ├── route_id → routes
  ├── stop_name, time
  ├── stop_lat, stop_lng, geofence_radius_m
  └── created_at
```

## TypeScript Type Changes

### Updated types

```typescript
// src/types/index.ts

export type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "superuser" | "driver";  // ← add "driver"
  is_active: boolean;
  created_at: string;
};

export type Van = {
  // ... existing fields ...
  driver_id: string | null;  // ← NEW
};

export type RouteRun = {
  id: string;
  route_id: string;
  service_date: string;
  started_at: string | null;  // ← NEW
  ended_at: string | null;    // ← NEW
  created_at: string;
  updated_at: string;
};
```

### New types

```typescript
// Run status derived from started_at/ended_at
export type RunStatus = "waiting" | "in_progress" | "completed";

// Driver's route view (GET /api/driver/routes response item)
export type DriverRoute = {
  id: string;           // route.id
  name: string;         // route.name
  vanName: string;      // van.name
  totalStops: number;
  firstStopTime: string | null;  // HH:mm
  lastStopTime: string | null;   // HH:mm
  run: {
    id: string;
    serviceDate: string;
    status: RunStatus;
    startedAt: string | null;
    endedAt: string | null;
  } | null;
};
```

## State Transitions

```
                    ┌──────────────────────────┐
                    │     No route_run row      │
                    │  (no GPS pings, no start) │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │ GPS ping       │ Driver starts   │
              ▼                ▼                 │
   ┌─────────────────┐  ┌──────────────────┐    │
   │    waiting       │  │   in_progress    │◄───┘
   │ started_at=NULL  │  │ started_at=set   │
   │ ended_at=NULL    │  │ ended_at=NULL    │
   └────────┬─────────┘  └────────┬─────────┘
            │ Driver starts       │ Driver ends
            │                     │ (with confirmation)
            ▼                     ▼
   ┌──────────────────┐  ┌──────────────────┐
   │   in_progress     │  │   completed      │
   │ started_at=set    │  │ started_at=set   │
   │ ended_at=NULL     │  │ ended_at=set     │
   └──────────────────┘  └──────────────────┘
                                  │
                                  ✕ (final, no undo)
```

## Validation Rules

- `started_at` can only be set once per run (no re-starting).
- `ended_at` can only be set if `started_at` is already set (can't end without starting).
- `ended_at` can only be set once per run (no undo; confirmation required in UI).
- Only the driver assigned to the van that owns the route can start/end.
- Starting creates the `route_run` row if it doesn't exist (upsert on `route_id + service_date`).
