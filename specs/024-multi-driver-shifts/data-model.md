# Data Model: Multi-Driver Shift Support

## Migration: `00004_multi_driver_shifts.sql`

```sql
-- Migration: 00004_multi_driver_shifts
-- Multi-driver shift support: van_drivers (many-to-many), route_shifts,
-- data migration from vans.driver_id and route_runs.started_at/ended_at,
-- and column deprecation.

-- ============================================================
-- 1. New tables
-- ============================================================

CREATE TABLE van_drivers (
  van_id uuid NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (van_id, driver_id)
);

CREATE INDEX idx_van_drivers_driver ON van_drivers (driver_id);

CREATE TABLE route_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_shifts_run ON route_shifts (run_id, started_at);
CREATE INDEX idx_route_shifts_driver ON route_shifts (driver_id, started_at DESC);

-- ============================================================
-- 2. RLS (access via service role in BFF, same pattern as other tables)
-- ============================================================

ALTER TABLE van_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_shifts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Migrate existing data
-- ============================================================

-- 3a. Migrate vans.driver_id -> van_drivers
INSERT INTO van_drivers (van_id, driver_id)
SELECT id, driver_id
FROM vans
WHERE driver_id IS NOT NULL;

-- 3b. Migrate route_runs.started_at/ended_at -> route_shifts
INSERT INTO route_shifts (run_id, driver_id, started_at, ended_at, created_at)
SELECT
  rr.id,
  v.driver_id,
  rr.started_at,
  rr.ended_at,
  rr.started_at
FROM route_runs rr
JOIN routes r ON r.id = rr.route_id
JOIN vans v ON v.id = r.van_id
WHERE rr.started_at IS NOT NULL
  AND v.driver_id IS NOT NULL;

-- ============================================================
-- 4. Drop deprecated columns
-- ============================================================

ALTER TABLE vans DROP COLUMN driver_id;
ALTER TABLE route_runs DROP COLUMN started_at;
ALTER TABLE route_runs DROP COLUMN ended_at;
```

### Migration Notes

- `van_drivers.driver_id` and `route_shifts.driver_id` reference `auth.users(id)` logically (no FK), following the existing pattern from `vans.driver_id`.
- Step 3b only migrates runs with `started_at IS NOT NULL` where the van has an assigned driver. Implicit runs (GPS-only, no start) have no shift to create.
- Columns are dropped only after data migration — no data loss.

## Entity Relationship Diagram

```
auth.users (Supabase Auth)
  └── app_metadata: { role: "admin"|"superuser"|"driver", is_active: boolean }

vans
  ├── id (PK)
  ├── name
  ├── ingestion_token (UNIQUE)
  ├── location_url
  ├── location_updated_at
  ├── last_lat, last_lng, last_accuracy_m, last_speed_mps, last_heading_deg
  └── created_at, updated_at

van_drivers                        ← NEW
  ├── van_id (PK, FK → vans)
  ├── driver_id (PK)              ← logical FK to auth.users
  └── created_at

routes
  ├── id (PK)
  ├── name
  ├── van_id → vans (UNIQUE, NOT NULL) [1:1]
  └── created_at, updated_at

route_runs
  ├── id (PK)
  ├── route_id → routes (ON DELETE CASCADE)
  ├── service_date (date)
  ├── created_at, updated_at
  └── UNIQUE (route_id, service_date)
  (started_at and ended_at REMOVED — now on route_shifts)

route_shifts                       ← NEW
  ├── id (PK, uuid)
  ├── run_id → route_runs (ON DELETE CASCADE)
  ├── driver_id                    ← logical FK to auth.users
  ├── started_at (timestamptz, NOT NULL)
  ├── ended_at (timestamptz, nullable)
  └── created_at

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

## Derived Run Status

Status is derived from `route_shifts` + schedule window, not from columns on `route_runs`.

| Shifts exist? | Any shift active? | Schedule window | Derived status | Portal behavior |
|---------------|-------------------|-----------------|----------------|-----------------|
| No            | N/A               | Any             | `waiting`      | Schedule-only   |
| Yes           | Yes               | Any             | `in_progress`  | Live tracking   |
| Yes           | No (all ended)    | Still open      | `idle`         | Schedule-only (neutral) |
| Yes           | No (all ended)    | Passed          | `completed`    | "Route ended for today" |

### deriveRunStatus replacement

```typescript
export function deriveRunStatus(
  shifts: { ended_at: string | null }[],
  isPastScheduleWindow: boolean,
): RunStatus {
  if (shifts.length === 0) return "waiting";
  const hasActive = shifts.some((s) => s.ended_at === null);
  if (hasActive) return "in_progress";
  if (isPastScheduleWindow) return "completed";
  return "idle";
}
```

## TypeScript Type Changes

### Updated types

```typescript
// src/types/index.ts

export type Van = {
  id: string;
  name: string;
  // driver_id: REMOVED
  location_url: string | null;
  location_updated_at: string | null;
  ingestion_token: string;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy_m: number | null;
  last_speed_mps: number | null;
  last_heading_deg: number | null;
  created_at: string;
  updated_at: string;
};

export type RouteRun = {
  id: string;
  route_id: string;
  service_date: string;
  // started_at: REMOVED
  // ended_at: REMOVED
  created_at: string;
  updated_at: string;
};

export type RunStatus = "waiting" | "in_progress" | "idle" | "completed";

export type RouteProgress = {
  serviceDate: string;
  runStatus?: RunStatus;
  shiftStartedAt?: string | null;  // from active route_shift
  nextStopId: string | null;
  passedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  etaSource: "gps" | "schedule" | null;
};

export type DriverRoute = {
  id: string;
  name: string;
  vanName: string;
  totalStops: number;
  firstStopTime: string | null;
  lastStopTime: string | null;
  runStatus: RunStatus;
  run: {
    id: string;
    serviceDate: string;
  } | null;
  activeShift: {
    id: string;
    driverId: string;
    startedAt: string;
  } | null;
  todayShifts: {
    id: string;
    driverId: string;
    driverEmail: string;
    startedAt: string;
    endedAt: string | null;
  }[];
};
```

### New types

```typescript
export type VanDriver = {
  van_id: string;
  driver_id: string;
  created_at: string;
};

export type RouteShift = {
  id: string;
  run_id: string;
  driver_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};
```

## State Transitions

### Shift Lifecycle

```
    Driver taps "Start Shift"
    (no other active shift on this run)
              │
              ▼
   ┌──────────────────┐
   │     active       │
   │  started_at=set  │
   │  ended_at=NULL   │
   └────────┬─────────┘
            │ Driver taps "End Shift" (with confirmation)
            ▼
   ┌──────────────────┐
   │      ended       │
   │  started_at=set  │
   │  ended_at=set    │
   └──────────────────┘
            ✕ (final — shifts are immutable once ended)
```

### Run Status (derived from shifts + schedule)

```
  waiting ──► in_progress ──► idle ──► in_progress (cycle)
                │                         │
                │                         ▼
                └─────────────────► completed (terminal)
```

## Validation Rules

### Van-Driver Assignments

1. A driver can be assigned to multiple vans.
2. A van can have multiple assigned drivers.
3. Only users with `role = "driver"` can be assigned (app-enforced).
4. Removing a driver does NOT terminate their active shift (future shifts only).
5. Only admins/superusers can manage assignments.

### Route Shifts

6. `started_at` is required at creation. No shift exists without a start time.
7. `ended_at` is set once (NULL → timestamp). Immutable after that.
8. `ended_at` must be >= `started_at` (app-enforced).
9. No overlapping shifts per run — check `ended_at IS NULL` count = 0 before insert.
10. Only van-assigned drivers can start shifts (check `van_drivers`).
11. Only the driver who started a shift can end it.
12. Shifts cannot start when run status is `completed` (schedule window passed).
13. Auto-create `route_run` if none exists for today (upsert on `route_id + service_date`).
14. Same driver can start a new shift after ending one (if no other active shift).

### Stop Progress

15. `route_run_stops` are NOT reset between shifts. Progress accumulates.
16. ETA uses active shift's `started_at` for stop filtering.
