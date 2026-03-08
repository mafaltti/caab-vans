# Implementation Plan

## Phase 1 — Fix Semantics Without Destabilizing Inference

### 1. Add Explicit Tracking-State Fields to the Public Payload

Change [`src/types/index.ts`](C:/Projetos/caab-vans/src/types/index.ts) and both route APIs at [`src/app/api/routes/route.ts`](C:/Projetos/caab-vans/src/app/api/routes/route.ts) and [`src/app/api/routes/[routeId]/route.ts`](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts).

Add:
- `trackingStatus: "live" | "stale" | "missing"`
- `isTrackingFresh: boolean`
- keep `runStatus` as the route lifecycle source of truth
- keep `isRunning` temporarily for compatibility, but derive it from `runStatus === "in_progress"` only, not freshness

### 2. Separate Route Lifecycle from Telemetry Health

In [`src/app/api/routes/route.ts`](C:/Projetos/caab-vans/src/app/api/routes/route.ts) and [`src/app/api/routes/[routeId]/route.ts`](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts):

- compute `runStatus` exactly as today via [`src/lib/tracking/run-status.ts`](C:/Projetos/caab-vans/src/lib/tracking/run-status.ts)
- compute `trackingStatus` from `last_gps_fix_at` using [`src/lib/time.ts`](C:/Projetos/caab-vans/src/lib/time.ts)
- stop suppressing route activity just because GPS is stale

UI then decides whether to show "running with stale location" instead of "not running".

### 3. Surface Tracker Health for Admin and Optionally Driver

Reuse [`src/lib/tracking/tracker-health.ts`](C:/Projetos/caab-vans/src/lib/tracking/tracker-health.ts). Add an admin endpoint or extend existing admin van endpoints in [`src/app/api/admin/vans/route.ts`](C:/Projetos/caab-vans/src/app/api/admin/vans/route.ts) and [`src/app/api/admin/vans/[vanId]/route.ts`](C:/Projetos/caab-vans/src/app/api/admin/vans/[vanId]/route.ts) to expose:

- `lastGpsFixAt`
- `staleSinceMinutes`
- `bufferSize`
- `failureCount`
- `isUnhealthy`

---

## Phase 2 — Reduce False Positives in Stop Progress

### 1. Add Confidence Metadata for Stop Passage

Create a migration after [`supabase/migrations/00009_atomic_van_position.sql`](C:/Projetos/caab-vans/supabase/migrations/00009_atomic_van_position.sql) to extend `route_run_stops` with:

- `pass_source text check in ('geofence_raw','geofence_snapped','backfill','manual') null`
- `pass_confidence numeric null`
- optionally `pass_method_version text null`

Keep `status` as `pending|passed` for minimal API churn.

### 2. Add Logical Repeated-Stop Grouping

Create a migration extending `schedule_entries` from the schema introduced in [`supabase/migrations/00002_live_tracking.sql`](C:/Projetos/caab-vans/supabase/migrations/00002_live_tracking.sql):

- `stop_group_id text null`

In admin schedule APIs and validators:
- [`src/lib/validators/schedule-entry.ts`](C:/Projetos/caab-vans/src/lib/validators/schedule-entry.ts)
- [`src/app/api/admin/routes/[routeId]/schedule/route.ts`](C:/Projetos/caab-vans/src/app/api/admin/routes/[routeId]/schedule/route.ts)
- [`src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts`](C:/Projetos/caab-vans/src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts)

Accept and return `stop_group_id`. In inference, prefer `stop_group_id`; only fall back to rounded coordinates when it is missing.

### 3. Replace Unconditional Backfill with Gated Backfill

Modify [`src/lib/tracking/infer-stop-progress.ts`](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts):

- extract matching into a helper returning `{matchedStopId, source, confidence}`
- only backfill if the matched stop is high-confidence
- recommended initial rule — high confidence if:
  - 2 recent pings within geofence, or
  - snapped and raw both support the same stop, or
  - stop is at least 2 pending stops ahead and current time is after its scheduled time
- backfilled stops should be written with `pass_source='backfill'` and lower confidence

### 4. Persist Progress Pointers on the Run

Extend `route_runs` with:

- `last_passed_stop_id uuid null`
- `next_stop_id uuid null`
- `progress_updated_at timestamptz null`

Update them inside [`src/lib/tracking/infer-stop-progress.ts`](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts). Then route APIs read these first, instead of reconstructing next stop entirely from `route_run_stops`.

---

## Phase 3 — Improve ETA Quality Without Breaking Fallback Behavior

### 1. Add Hybrid Raw/Snapped Distance Policy

In [`src/app/api/tracking/[vanId]/route.ts`](C:/Projetos/caab-vans/src/app/api/tracking/[vanId]/route.ts) and [`src/app/api/tracking-batch/[vanId]/route.ts`](C:/Projetos/caab-vans/src/app/api/tracking-batch/[vanId]/route.ts), keep storing both raw and snapped.

In [`src/lib/tracking/eta.ts`](C:/Projetos/caab-vans/src/lib/tracking/eta.ts):

- continue to prefer snapped for map/ETA
- for stop passage logic, pass both raw and snapped candidates into inference
- choose snapped only when snap displacement from raw is below a threshold like `30–50m`, otherwise trust raw more

### 2. Add Segment-Aware Fallback ETA

Extend [`src/lib/tracking/eta.ts`](C:/Projetos/caab-vans/src/lib/tracking/eta.ts):

- current order: GPS ETA → schedule shift fallback
- target order: GPS ETA → segment-aware historical ETA → schedule shift fallback

Segment-aware fallback should use:
- last passed stop
- next stop
- `osrm_distance_m` from [`supabase/migrations/00008_add_osrm_distance.sql`](C:/Projetos/caab-vans/supabase/migrations/00008_add_osrm_distance.sql)
- historical factor from [`src/lib/tracking/time-factors.ts`](C:/Projetos/caab-vans/src/lib/tracking/time-factors.ts)
- recent same-run ratios when available

This is the best low-risk ETA upgrade because it uses data already in the system.

### 3. Keep Schedule Fallback as Final Safety Net

Do not remove `scheduleDelayFallback` from [`src/lib/tracking/eta.ts`](C:/Projetos/caab-vans/src/lib/tracking/eta.ts). It remains the final fallback when:

- no usable GPS
- no stop coordinates
- no last passed stop
- no segment distance data

---

## Tests and Rollout

Add tests **before** rollout, not after.

### Stop Progress Tests

Extend [`src/__tests__/tracking/infer-stop-progress.test.ts`](C:/Projetos/caab-vans/src/__tests__/tracking/infer-stop-progress.test.ts) with:

- stale GPS does not change `runStatus`
- repeated stops grouped by `stop_group_id`
- low-confidence match does not trigger backfill
- raw/snapped disagreement near off-road stop
- high-confidence match does trigger backfill
- persisted `next_stop_id` and `last_passed_stop_id` updates

### ETA Tests

Extend [`src/__tests__/tracking/eta.test.ts`](C:/Projetos/caab-vans/src/__tests__/tracking/eta.test.ts) with:

- segment-aware fallback path
- stale-tracking but active-run response semantics
- snapped-vs-raw threshold behavior
- same ETA target when reading persisted `next_stop_id`

### API Tests

Add API tests around:
- [`src/app/api/routes/route.ts`](C:/Projetos/caab-vans/src/app/api/routes/route.ts)
- [`src/app/api/routes/[routeId]/route.ts`](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts)

Validate `runStatus`, `trackingStatus`, and compatibility `isRunning`.

### Rollout Order

1. Deploy schema additions first.
2. Write new fields while still reading old behavior.
3. Add shadow logging comparing old vs new inference for a few days.
4. Switch reads to persisted progress pointers.
5. Remove old reconstruction logic once outputs stabilize.

### Doc Updates

Update docs to match runtime:
- [`docs/ETA-CONFIGURATION.md`](C:/Projetos/caab-vans/docs/ETA-CONFIGURATION.md)
- any execution notes under [`docs/execution`](C:/Projetos/caab-vans/docs/execution)

---

*If you want the next step, I can turn this into an execution-ready task list with exact file-by-file edits and migration names.*
