# Data Model: Driver Workflow V1

**Feature**: 068-driver-workflow-v1
**Date**: 2026-03-11

## Migration: 00020_stop_exceptions.sql

### 1. Extend `route_run_stops.status` CHECK Constraint

**Current**:
```sql
status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'passed'))
```

**New**:
```sql
-- Drop existing CHECK and replace
ALTER TABLE route_run_stops DROP CONSTRAINT route_run_stops_status_check;
ALTER TABLE route_run_stops ADD CONSTRAINT route_run_stops_status_check
  CHECK (status IN ('pending', 'passed', 'skipped'));
```

### 2. Add Exception Metadata to `route_run_stops`

```sql
ALTER TABLE route_run_stops
  ADD COLUMN reason_code text,
  ADD COLUMN note text,
  ADD COLUMN acted_by uuid,
  ADD COLUMN acted_at timestamptz;
```

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `reason_code` | text | YES | Structured reason code (e.g., `road_closure`, `no_passengers`) |
| `note` | text | YES | Free-text note from driver (used with reason_code = `other`) |
| `acted_by` | uuid | YES | Driver who performed the skip action |
| `acted_at` | timestamptz | YES | When the skip action was recorded |

**Constraints**: These columns are nullable because they only apply to `skipped` stops. For `pending` and `passed` stops, they remain NULL.

### 3. Create `route_run_events` Table (Audit Log)

```sql
CREATE TABLE route_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'stop_skipped',
      'detour_started',
      'detour_ended'
    )),
  schedule_entry_id uuid REFERENCES schedule_entries(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  reason_code text,
  note text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_run_events_run ON route_run_events (run_id, created_at);
CREATE INDEX idx_route_run_events_type ON route_run_events (event_type);
```

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | NO | Primary key |
| `run_id` | uuid | NO | FK to route_runs (CASCADE on delete) |
| `event_type` | text | NO | One of: `stop_skipped`, `detour_started`, `detour_ended` |
| `schedule_entry_id` | uuid | YES | FK to schedule_entries (NULL for non-stop events like detour) |
| `actor_id` | uuid | NO | Driver who performed the action |
| `reason_code` | text | YES | Structured reason code |
| `note` | text | YES | Free-text note |
| `metadata` | jsonb | YES | Flexible data for future extensibility |
| `created_at` | timestamptz | NO | Immutable creation timestamp |

**RLS**: Enabled, service-role only (no anon policies). Matches existing pattern for `route_run_stops`, `route_shifts`.

**Immutability**: No UPDATE or DELETE policies. Events are append-only by design. The application layer enforces this by never issuing UPDATE/DELETE on this table.

### 4. Add Detour State to `route_runs`

```sql
ALTER TABLE route_runs
  ADD COLUMN is_detour_active boolean NOT NULL DEFAULT false,
  ADD COLUMN detour_reason_code text,
  ADD COLUMN detour_note text,
  ADD COLUMN has_skipped_stops boolean NOT NULL DEFAULT false;
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `is_detour_active` | boolean | NO | false | Whether detour mode is currently on |
| `detour_reason_code` | text | YES | NULL | Active detour reason code |
| `detour_note` | text | YES | NULL | Active detour free-text note |
| `has_skipped_stops` | boolean | NO | false | Quick flag: true if any stop in this run was skipped |

**Detour lifecycle**:
- `detour_started` → set `is_detour_active = true`, `detour_reason_code`, `detour_note`
- `detour_ended` → set `is_detour_active = false`, clear `detour_reason_code` and `detour_note`
- Shift ends while detour active → auto-deactivate (same as `detour_ended` with reason `shift_ended`)

**`has_skipped_stops` lifecycle**:
- Set to `true` on first skip in a run. Never reverted (skip is final in V1).
- Enables efficient filtering in the public route list query without joining `route_run_stops`.

### 5. Enable RLS on `route_run_events`

```sql
ALTER TABLE route_run_events ENABLE ROW LEVEL SECURITY;
```

No anon policies — same as existing tracking tables.

---

## State Transitions

### Stop Status (route_run_stops.status)

```
           ┌──────────┐
           │ pending  │ (initial)
           └────┬─────┘
                │
        ┌───────┼───────┐
        ▼               ▼
  ┌──────────┐    ┌──────────┐
  │  passed  │    │ skipped  │
  │(terminal)│    │(terminal)│
  └──────────┘    └──────────┘
```

- `pending → passed`: Via geofence (raw, snapped, device), backfill, or manual confirmation
- `pending → skipped`: Via driver skip action (requires reason, head-of-line only)
- `passed` and `skipped` are both terminal — no reversals in V1

### Contiguous-Prefix Resolution

The "resolved prefix" now includes both `passed` and `skipped` stops:

```
Stops by sequence: [1:passed] [2:skipped] [3:passed] [4:pending] [5:pending]
                    ─────────resolved prefix──────────  ────remaining────
                                                    ↑
                                              next_stop_id = 4
                                        last_passed_stop_id = 3
```

### Detour Mode (route_runs)

```
  ┌───────────────┐
  │ normal        │ (is_detour_active = false)
  │               │
  └───────┬───────┘
          │ detour_started (driver action)
          ▼
  ┌───────────────┐
  │ detouring     │ (is_detour_active = true)
  │               │
  └───────┬───────┘
          │ detour_ended (driver action OR shift_ended)
          ▼
  ┌───────────────┐
  │ normal        │ (is_detour_active = false)
  └───────────────┘
```

---

## TypeScript Type Changes

### Extended Types (src/types/index.ts)

```typescript
// Stop status — extended
// Currently: "pending" | "passed"
// New: "pending" | "passed" | "skipped"

export type RouteRunStop = {
  run_id: string;
  schedule_entry_id: string;
  status: "pending" | "passed" | "skipped";
  passed_at: string | null;
  pass_source: PassSource | null;
  pass_confidence: number | null;
  // New fields:
  reason_code: string | null;
  note: string | null;
  acted_by: string | null;
  acted_at: string | null;
};

// New: Audit event
export type RouteRunEvent = {
  id: string;
  run_id: string;
  event_type: "stop_skipped" | "detour_started" | "detour_ended";
  schedule_entry_id: string | null;
  actor_id: string;
  reason_code: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// Extended: RouteRun
export type RouteRun = {
  id: string;
  route_id: string;
  service_date: string;
  last_passed_stop_id: string | null;
  next_stop_id: string | null;
  progress_updated_at: string | null;
  // New fields:
  is_detour_active: boolean;
  detour_reason_code: string | null;
  detour_note: string | null;
  has_skipped_stops: boolean;
  created_at: string;
  updated_at: string;
};

// Reason code enums (managed in code, not DB)
export const SKIP_REASON_CODES = [
  "road_closure",
  "no_passengers",
  "facility_closed",
  "vehicle_issue",
  "other",
] as const;
export type SkipReasonCode = (typeof SKIP_REASON_CODES)[number];

export const DETOUR_REASON_CODES = [
  "road_closure",
  "accident",
  "construction",
  "flooding",
  "police_checkpoint",
  "other",
] as const;
export type DetourReasonCode = (typeof DETOUR_REASON_CODES)[number];
```

---

## Affected Queries Summary

| Query Location | Change |
|----------------|--------|
| `enforceCanonicalPrefix()` | Treat `skipped` as resolved in prefix walk |
| `persistCanonicalProgress()` | `next_stop_id` skips over `skipped` stops |
| `resolveRouteProgress()` | Include `skipped` in resolved prefix; add exception data to response |
| `inferStopProgress()` | Backfill only `pending` stops (already filtered, verify) |
| `processDeviceGeofenceEvents()` | Pending list already excludes non-pending (verify) |
| `computeEta()` | Delay excludes skipped stops; ETA targets first pending |
| `deriveRunStatus()` | No change (derives from shifts, not stops) |
| `GET /api/routes` | Response includes `has_skipped_stops`, `is_detour_active` |
| `GET /api/routes/[routeId]` | Response includes stop-level `status` with `skipped` value |
| `GET /api/driver/routes` | Response includes exception flags |
| `GET /api/driver/routes/[routeId]` | New endpoint: full detail + tracker health |
| `POST skip-stop` | New endpoint |
| `POST detour` | New endpoint |
