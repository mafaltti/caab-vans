# Research: Tracking System Hardening

## R1: Event-Time Inference Signature Change

**Decision**: Change `inferStopProgress` from positional args `(supabase, vanId, lat, lng, snappedLat?, snappedLng?)` to an object arg including `eventTs: string` (ISO).

**Rationale**: The current signature has no way to pass event time — it derives service date from `todayBahiaDate()` and uses `nowBahia()` for all time comparisons. Batch replay requires each ping to carry its own device timestamp for correct service date derivation, shift gating, and `passed_at` recording.

**Alternatives considered**:
- Adding `eventTs` as a 7th positional arg → rejected: too many positional params, error-prone.
- Passing a `DateTime` object → rejected: ISO string is easier to serialize, and the function already parses internally.

**Current code references**:
- `infer-stop-progress.ts:28-35` — current positional signature
- `infer-stop-progress.ts:51` — `todayBahiaDate()` for service date
- `infer-stop-progress.ts:174` — `nowBahia()` for time comparisons
- `infer-stop-progress.ts:313` — `new Date().toISOString()` for `passed_at`

## R2: Shift Gating at Event Time

**Decision**: Replace `ended_at IS NULL` shift gate with a query that finds a shift active at `eventTs` (started before eventTs and not ended before eventTs).

**Rationale**: The current gate (`infer-stop-progress.ts:71-77`) uses `.is("ended_at", null)` which means replay of buffered pings that arrive after a shift ends by wall-clock time will fail the gate. The fix must allow inference for pings whose device timestamps fall within the shift's active window.

**Alternatives considered**:
- Removing the shift gate entirely → rejected: inference without an active shift context is meaningless.
- Using `started_at <= eventTs AND (ended_at IS NULL OR ended_at > eventTs)` → chosen: covers both active and recently-ended shifts.

## R3: Canonical Write vs Read-Path Masking

**Decision**: Move the contiguous prefix logic from the read path (resolve-route-progress.ts:146-159) into the write path (infer-stop-progress.ts), and add DB cleanup of non-contiguous rows.

**Rationale**: Currently, non-contiguous passed rows persist in `route_run_stops` and are only masked on reads. This creates data integrity issues: the DB contains false information, and any consumer that reads directly sees incorrect state.

**Current code references**:
- `infer-stop-progress.ts:437-472` — adjacency walk exists but only affects return value, not DB
- `resolve-route-progress.ts:146-159` — read-path masking of non-contiguous rows

**Implementation approach**:
1. After computing `candidatePassedSet` (existing + new matches + backfills), walk from route start to find contiguous prefix.
2. Write only rows entering the prefix.
3. Revert any stored `passed` rows outside the prefix to `pending` (clear `passed_at`, `pass_source`, `pass_confidence`).
4. Persist pointers from canonical prefix only.
5. Keep read-path masking as defense-in-depth until verified stable.

## R4: OSRM matchTrajectory for Per-Ping Snapped Coords

**Decision**: Add `matchTrajectory()` to `osrm.ts` that returns per-point snapped coordinates from OSRM /match, alongside existing `snapToRoad()`.

**Rationale**: `snapToRoad()` currently returns only the last point's snapped position. For batch replay, each accepted ping needs its own snapped coordinates to support source-aligned confidence scoring.

**Current code**: `osrm.ts:63-115` — `snapToRoad()` uses OSRM /match but only extracts the last tracepoint.

**Implementation**: Parse all tracepoints from the OSRM /match response. Return `Array<{ lat: number; lng: number } | null>` where null indicates an unmatched point.

## R5: Effective Position Helper

**Decision**: Create `src/lib/tracking/effective-position.ts` with a shared function used by both `infer-stop-progress.ts` and `eta.ts`.

**Rationale**: Currently, `infer-stop-progress.ts:210-231` has inline per-stop raw-vs-snapped logic, while `eta.ts` uses `vanPosition.lat/lng` (raw only, no snapped). The spec requires both to use the same effective position for the active target stop.

**Implementation**:
- `chooseEffectivePosition({ rawLat, rawLng, snappedLat, snappedLng, targetLat, targetLng, snapDisplacementThreshold })` → `{ lat, lng, source: "raw" | "snapped" }`
- Extract `SNAP_DISPLACEMENT_THRESHOLD_M` to the shared module.

## R6: VanPosition Type Extension

**Decision**: Extend `VanPosition` in `eta.ts` to carry both `rawLat/rawLng` and `snappedLat/snappedLng`.

**Rationale**: Currently `VanPosition` has only `lat`/`lng`. ETA needs access to both coordinate sources to use the shared effective-position helper for the active target stop.

**Current code**: `eta.ts:17-23` — `VanPosition` interface.

## R7: Confidence Evidence Changes

**Decision**: Remove `.limit(50)` cap, use full 5-minute window, and align evidence source with match source.

**Current code**: `infer-stop-progress.ts:197-204` — evidence query with `.limit(50)`.

**Implementation**:
1. Remove `.limit(50)` from the evidence query.
2. For snapped-triggered matches, count only pings with stored `snapped_lat`/`snapped_lng`.
3. For raw-triggered matches, count using raw `lat`/`lng` (current behavior).
4. This depends on per-ping snapped coords from R4.

## R8: Orphaned Shift Health

**Decision**: Extract orphan detection criteria into a shared helper at `src/lib/tracking/orphaned-shift-health.ts`, reuse in both the script and the read path.

**Current code**: `scripts/reconcile-orphaned-shifts.ts:16-17` — `SCHEDULE_OVERDUE_MINUTES = 90`, `INACTIVITY_MINUTES = 30`.

**Implementation**:
- Shared helper: `isOrphanedShift({ scheduledEnd, lastActivity, now })` → boolean
- `resolveRouteProgress` sets `runHealth: "orphaned" | "normal"` based on the helper.
- Script imports shared helper instead of inline criteria.

## R9: Migration Numbering

**Decision**: Next migration is `00014_add_snapped_coords_to_van_location_pings.sql`.

**Rationale**: Latest migration is `00013_persist_progress_pointers.sql`. The gap analysis doc noted that 00010 was already taken.

## R10: Batch Route — Inference Per Ping

**Decision**: Change batch route to replay `inferStopProgress()` for every accepted non-duplicate ping in chronological order, not just the newest.

**Current code**: `tracking-batch/[vanId]/route.ts:134-193` — inference called once for `newestUpserted` only, and only when `update_van_position` returns true.

**Key changes**:
1. After each successful upsert (non-duplicate), call `inferStopProgress()` with that ping's coordinates and `eventTs`.
2. Only call `update_van_position` once for the newest point.
3. Compute per-ping snapped coordinates via `matchTrajectory()`.
