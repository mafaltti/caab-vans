# Implementation Plan: Tracking System Hardening

**Branch**: `058-tracking-hardening` | **Date**: 2026-03-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/058-tracking-hardening/spec.md`

## Summary

Fix five confirmed tracking gaps: (1) replay stop inference by event time for batch/buffered pings, (2) canonicalize `route_run_stops` on write instead of masking on read, (3) align ETA and stop passage position selection via a shared helper, (4) remove evidence cap and align confidence source, (5) surface orphaned-shift health on the read path.

The approach modifies `inferStopProgress` to accept an object argument with `eventTs`, changes batch ingestion to replay inference per-ping, adds canonical write enforcement, introduces two small shared helpers (effective-position, orphan-health), and adds one schema migration for per-ping snapped coordinates.

## Technical Context

**Language/Version**: TypeScript ~5.x (Next.js 16 App Router)
**Primary Dependencies**: Next.js, Supabase JS client, Luxon, Zod
**Storage**: PostgreSQL via Supabase (self-hosted)
**Testing**: Vitest
**Target Platform**: Linux server (VPS)
**Project Type**: Web service (BFF + public pages)
**Performance Goals**: Batch replay of up to 100 pings sequentially per request; sub-second single-ping inference
**Constraints**: OSRM best-effort (fallback to raw GPS); canonical timezone America/Bahia
**Scale/Scope**: Single-digit concurrent vans; ~1-5 pings/second per van

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Two new helpers (`effective-position`, `orphaned-shift-health`) each have 2 consumers — justified. `matchTrajectory` wraps existing OSRM /match parsing. No speculative abstractions. |
| II. Explicit Trade-offs in PRs | PASS | PR will document: canonical-write vs read-masking trade-off, sequential replay vs parallel. |
| III. Branch & Merge Discipline | PASS | Feature branch `058-tracking-hardening` targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests must pass. New test files for batch replay and extended tests for existing suites. |
| V. Stack Constraints | PASS | All changes within Next.js Route Handlers + lib/tracking. Luxon for time. Supabase for storage. No Edge Functions. |
| Security Constraints | PASS | No changes to auth, RLS, or key exposure. Service-role client used only in server routes. |
| Timezone & Data Consistency | PASS | Service date derived from device timestamp in America/Bahia. `passed_at` stored as ISO from `eventTs`. |

**Post-Phase 1 re-check**: PASS — no new violations introduced by design artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/058-tracking-hardening/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── infer-stop-progress.md
│   ├── effective-position.md
│   └── orphaned-shift-health.md
└── tasks.md                      # Created by /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── app/api/
│   ├── tracking/[vanId]/route.ts        # Modified: pass eventTs, decouple inference from RPC gate, write snapped coords
│   └── tracking-batch/[vanId]/route.ts  # Modified: per-ping replay, matchTrajectory
├── lib/tracking/
│   ├── infer-stop-progress.ts           # Modified: object arg, event-time, canonical writes
│   ├── effective-position.ts            # NEW: shared position-selection helper
│   ├── orphaned-shift-health.ts         # NEW: shared orphan detection
│   ├── eta.ts                           # Modified: VanPosition extension, shared helper
│   ├── osrm.ts                          # Modified: add matchTrajectory()
│   ├── resolve-route-progress.ts        # Modified: add runHealth field
│   └── haversine.ts                     # Unchanged (used by new helper)
├── types/index.ts                       # Modified: add runHealth to RouteProgress
└── __tests__/tracking/
    ├── infer-stop-progress.test.ts      # Extended: event-time, canonical writes, healing
    ├── tracking-batch.test.ts           # NEW: batch replay tests
    ├── eta.test.ts                      # Extended: effective-position consistency
    ├── resolve-route-progress.test.ts   # Extended: runHealth
    └── effective-position.test.ts       # NEW: unit tests for shared helper

scripts/
└── reconcile-orphaned-shifts.ts         # Modified: use shared helper

supabase/migrations/
└── 00014_add_snapped_coords_to_van_location_pings.sql  # NEW
```

**Structure Decision**: All changes fit within the existing Next.js App Router structure. Two new files in `src/lib/tracking/` (both with 2 consumers each, per DRY rule). One new test file for batch replay. One new migration.

## Complexity Tracking

No constitution violations to justify. All new abstractions have 2+ immediate consumers.

## Implementation Phases

### Phase 1: Event-Time Inference (Foundational)

**Why first**: All other changes depend on `inferStopProgress` accepting `eventTs` and deriving time from it.

**Changes**:

1. **Schema migration** (`00014_add_snapped_coords_to_van_location_pings.sql`)
   - Add `snapped_lat double precision null`, `snapped_lng double precision null` to `van_location_pings`

2. **OSRM `matchTrajectory()`** (`osrm.ts`)
   - New function: parse all tracepoints from OSRM /match response
   - Returns `Array<{ lat: number; lng: number } | null> | null`
   - Keep `snapToRoad()` as wrapper for backward compat (single-ping route still uses it)

3. **`inferStopProgress` signature change** (`infer-stop-progress.ts`)
   - Object arg: `{ supabase, vanId, rawLat, rawLng, snappedLat, snappedLng, eventTs }`
   - Derive `eventTime = DateTime.fromISO(eventTs).setZone("America/Bahia")`
   - Derive `serviceDate` from `eventTime` (calendar date)
   - Shift gate: `started_at <= eventTs AND (ended_at IS NULL OR ended_at > eventTs)`
   - Use `eventTime` for early-arrival window and closest-in-time matching
   - Replace `parseTime(entry.time)` calls with event-time-anchored equivalent (e.g., `eventTime.set({ hour, minute })`) so stop schedule times are built from the event's date, not wall-clock today
   - Set `passed_at = eventTs` for geofence passes and backfills
   - Keep `progress_updated_at = new Date().toISOString()`

4. **Single-ping route update** (`tracking/[vanId]/route.ts`)
   - Pass `eventTs: deviceTs` to `inferStopProgress`
   - Rename `lat`/`lng` params to `rawLat`/`rawLng` in the call
   - Decouple inference from `update_van_position` result: always run `inferStopProgress` after a successful upsert, even when the RPC returns false (out-of-order ping accepted but not newest)
   - Write computed `snapped_lat`/`snapped_lng` back to the accepted `van_location_pings` row so single-ping evidence supports source-aligned confidence scoring
   - OSRM trajectory query filters with `.lte("device_ts", deviceTs)` so out-of-order pings only snap against earlier events

5. **Batch route update** (`tracking-batch/[vanId]/route.ts`)
   - After upsert loop: collect accepted (non-duplicate) pings in chronological order
   - OSRM-match accepted trajectory via `matchTrajectory()`, write `snapped_lat`/`snapped_lng` back to pings
   - Single-point batches fall back to `snapToRoad()` with recent stored pings (filtered by `.lte("device_ts", deviceTs)`) instead of skipping OSRM
   - Replay `inferStopProgress()` sequentially for each accepted ping with its own `eventTs`
   - Call `update_van_position` only once for the newest accepted point
   - Run inference even when `update_van_position` returns false (for older pings)

6. **Tests** (`tracking-batch.test.ts` — new, `infer-stop-progress.test.ts` — extended)
   - Batch: earlier ping crosses stop, later doesn't → progress advances
   - Batch: replay is chronological
   - Batch: inference runs even when RPC returns false
   - Batch: per-point snapped coords are passed into each inference call
   - Single-ping: inference runs even when `update_van_position` returns false
   - Update `tracking-dedup.test.ts` mock to use object arg signature; update/remove "does not call inferStopProgress when RPC returns false" test (behavior now changes — inference always runs for accepted pings)
   - Inference: event-time service date derivation
   - Inference: shift-active-at-event-time allows replay after shift end
   - Inference: `passed_at` equals `eventTs`

### Phase 2: Canonical Write Logic

**Why second**: Depends on event-time `passed_at` from Phase 1.

**Changes**:

1. **Canonical write in `inferStopProgress`** (`infer-stop-progress.ts`)
   - After computing `newlyPassedIds` and backfill candidates:
     a. Build `candidatePassedSet = existingPassed ∪ newMatches ∪ newBackfills`
     b. Walk from route start, keep only contiguous passed prefix
     c. Write only pending rows that enter the canonical prefix
     d. Revert stored `passed` rows outside prefix to `pending` (clear `passed_at`, `pass_source`, `pass_confidence`)
     e. Persist `last_passed_stop_id` / `next_stop_id` from canonical prefix only

2. **Keep read-path masking** (`resolve-route-progress.ts`)
   - Keep contiguous prefix logic (lines 146-159) as defense-in-depth
   - Remove once canonical writes are verified stable (tracked as future cleanup)

3. **Tests** (`infer-stop-progress.test.ts`)
   - Low-confidence late match does not persist non-contiguous `passed` row
   - Previously corrupted non-contiguous rows are healed back to `pending`
   - Contiguous legitimate passes all persist correctly

### Phase 3: Shared Position Selection

**Why third**: Independent but benefits from Phase 1 snapped coords.

**Changes**:

1. **New `effective-position.ts`** (`src/lib/tracking/effective-position.ts`)
   - `chooseEffectivePosition()` — see [contract](contracts/effective-position.md)
   - Move `SNAP_DISPLACEMENT_THRESHOLD_M` here (re-export from `infer-stop-progress.ts` for compat)

2. **Update `infer-stop-progress.ts`**
   - Replace inline per-stop raw-vs-snapped logic (lines 210-231) with `chooseEffectivePosition()` call

3. **Update `eta.ts`**
   - Extend `VanPosition` with `snappedLat`/`snappedLng`
   - In GPS branch: use `chooseEffectivePosition()` for distance to active target stop

4. **Update all `VanPosition` construction sites**
   - `src/app/api/routes/route.ts` (~line 114): pass raw and snapped coords separately instead of preferring snapped
   - `src/app/api/routes/[routeId]/route.ts` (~line 122): same change
   - Both files currently do `lat: hasSnapped ? van.snapped_lat! : van.last_lat` — change to pass `lat: van.last_lat` (raw) + `snappedLat: van.snapped_lat`

5. **Tests**
   - `effective-position.test.ts` — new: raw-preferred, snapped-preferred, fallback cases
   - `eta.test.ts` — extended: ETA and passage use same effective position

### Phase 4: Source-Aligned Confidence

**Why fourth**: Depends on Phase 1 per-ping snapped coords.

**Changes**:

1. **Remove `.limit(50)` and add event-time upper bound** (`infer-stop-progress.ts`)
   - Evidence query uses full 5-minute window without arbitrary ping cap
   - Query filters with `.lte("device_ts", eventTs)` to prevent batch replay from counting future pings

2. **Source-aligned evidence counting** (`infer-stop-progress.ts`)
   - For snapped-triggered matches: count only pings with stored `snapped_lat`/`snapped_lng` in geofence
   - For raw-triggered matches: count using raw `lat`/`lng` (current behavior)
   - Update evidence query to also select `snapped_lat`, `snapped_lng`

3. **Tests** (`infer-stop-progress.test.ts`)
   - Remove old `.limit(50)` expectation
   - Snapped corroboration uses snapped evidence
   - Raw corroboration uses raw evidence

### Phase 5: Orphaned Shift Health

**Why last**: Fully independent, lowest risk, purely additive.

**Changes**:

1. **New `orphaned-shift-health.ts`** (`src/lib/tracking/orphaned-shift-health.ts`)
   - `isOrphanedShift()` — see [contract](contracts/orphaned-shift-health.md)
   - Export `SCHEDULE_OVERDUE_MINUTES` and `INACTIVITY_MINUTES` constants

2. **Update `resolve-route-progress.ts`**
   - Add `runHealth: "normal" | "orphaned"` to `RouteProgress` interface (local)
   - Compute orphan criteria for open shifts using shared helper
   - Set `runHealth` in return value

3. **Update `src/types/index.ts`**
   - Add `runHealth?: "normal" | "orphaned"` to `RouteProgress` type

4. **Update `scripts/reconcile-orphaned-shifts.ts`**
   - Import `isOrphanedShift` and constants from shared helper
   - Remove inline `SCHEDULE_OVERDUE_MINUTES` and `INACTIVITY_MINUTES`

5. **Update `docs/OPERATIONS.md`**
   - Document `tracking:reconcile-shifts` as required runtime (not optional maintenance)
   - Add guidance for monitoring reconciliation health

6. **Tests**
   - `resolve-route-progress.test.ts` — extended: `runHealth = "orphaned"` when criteria met, `"normal"` otherwise
   - Verify reconciliation script still works with shared helper

## Dependency Graph

```
Phase 1: Event-Time Replay
    ↓
Phase 2: Canonical Writes  (depends on event-time passed_at)
    ↓
Phase 3: Shared Position   (independent, but benefits from snapped coords)
    ↓
Phase 4: Confidence Model  (depends on per-ping snapped coords from Phase 1)

Phase 5: Orphan Health     (fully independent, can ship anytime)
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase 1 breaks real-time ingestion | Medium | High | Extensive test coverage; single-ping route is minimal change; batch replay is the big delta |
| Canonical write reverts legitimate passes | Low | High | Contiguous prefix walk is deterministic; keep read-path masking as defense-in-depth |
| OSRM matchTrajectory fails for trajectories | Low | Low | Graceful null fallback; snapped coords optional |
| Signature change breaks callers | Low | Medium | Only 2 callers; both updated in Phase 1 |
| Sequential batch replay too slow | Low | Low | Batch capped at 100; each inference is a few DB queries |
