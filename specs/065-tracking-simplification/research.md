# Research: Tracking Simplification

**Feature**: 065-tracking-simplification
**Date**: 2026-03-11

## R1: Shared Helper Extraction Strategy

**Decision**: Extract a new `persistCanonicalProgress(supabase, runId)` function into `src/lib/tracking/persist-canonical-progress.ts` that encapsulates fetch → enforce → heal → persist.

**Rationale**: The pattern exists in two places today (`infer-stop-progress.ts:373-455` and `confirm-start-stop/route.ts:192-234`) with identical logic. Adding a 3rd caller (device geofence processing) justifies extraction per DRY >= 3 rule. The helper accepts a Supabase client and run ID, fetches stops internally, and returns the `CanonicalPrefixResult` after persisting.

**Alternatives considered**:
- *Accept pre-sorted stops as input (caller fetches)*: Rejected because callers would duplicate the fetch + sort logic. The helper should own the full cycle.
- *Keep inline in each caller*: Rejected because 3 identical implementations violates DRY.

**Key differences between existing implementations**:

| Aspect | infer-stop-progress | confirm-start-stop |
|--------|--------------------|--------------------|
| Fetch columns | No `pass_source` | Includes `pass_source` |
| `.order()` call | Yes | No (JS sort only) |
| Pointer guard | `if (lastPassedStopId !== null \|\| nextStopId !== null)` | None (always persists) |
| Error handling | Logs errors | None |
| Timestamp | `new Date().toISOString()` | `nowIso` variable |

**Unified design**: The shared helper will use `.order()` + JS sort (belt and suspenders), always persist (no guard — safe because update is idempotent), and log errors. It does not need `pass_source` in the fetch since it only reads `schedule_entry_id` and `status`.

---

## R2: GPS Inference Removal Impact

**Decision**: Remove `inferStopProgress()` calls from `tracking/[vanId]/route.ts` (line 213-226) and `tracking-batch/[vanId]/route.ts` (lines 220-237). Keep the function file as dead code initially.

**Rationale**: The spec is explicit — GPS pings must not mutate stop progress. Removing the calls is the minimal change. Deleting `infer-stop-progress.ts` entirely would also require updating its test file and any imports; deferring cleanup reduces blast radius.

**Alternatives considered**:
- *Delete `infer-stop-progress.ts` entirely*: Rejected for this cut. The file has extensive tests that serve as regression documentation. Cleanup is a follow-up chore.
- *Feature-flag the removal*: Rejected — YAGNI. The multi-mode pattern is what we're removing. Adding another flag contradicts the spec.

**Cascade effects**:
- Removing inference from main route also removes the "retry deferred geofence after GPS inference" branch (lines 228-244). Deferred events retry naturally on the next ping because `processDeviceGeofenceEvents()` is called before the removed inference block.
- Batch route has no geofence processing, so no cascade there.

---

## R3: Device Geofence Pointer Persistence

**Decision**: After `processDeviceGeofenceEvents()` marks a stop as passed (line 297), call `persistCanonicalProgress(supabase, runId)` to update `route_runs` pointers.

**Rationale**: Today, device geofence processing marks `route_run_stops` but relies on the subsequent `inferStopProgress()` call to persist pointers. Once GPS inference is removed, pointers would never update from geofence events. The shared helper fills this gap.

**Alternatives considered**:
- *Inline pointer update in processDeviceGeofenceEvents()*: Rejected — would create a 3rd copy of the canonical-prefix logic.
- *Call from the tracking route handler after processDeviceGeofenceEvents()*: Rejected — would couple the route handler to progress logic that belongs in the processing function.

**Placement**: Inside `processOneEvent()` after the successful mark-as-passed (line 305), before the ledger update (line 308). Only called when `matchedIndex === 0` (head-of-line succeeded).

---

## R4: Shift Start Seeding

**Decision**: Call `seedRouteRunStops()` + set `next_stop_id` inside `routes/[routeId]/start/route.ts` after route_run creation/lookup.

**Rationale**: Today, stops are lazily seeded on first geofence event or manual confirm. This leaves `next_stop_id` NULL until then, causing a gap where commuters see no next-stop information. Eager seeding at shift start eliminates this gap.

**Implementation**: After line ~99 (run created/retrieved), add:
1. `await seedRouteRunStops(supabase, run.id, route.id)`
2. `await persistCanonicalProgress(supabase, run.id)` — this sets `next_stop_id` to the first pending stop since all stops are "pending" at this point.

**Alternatives considered**:
- *Set `next_stop_id` manually without the helper*: Rejected — the helper already handles the fetch + enforce + persist cycle; calling it ensures consistency.
- *Seed on first GPS ping instead*: Rejected — creates the same gap problem for commuters.

---

## R5: Progress Resolver Simplification

**Decision**: Remove `TRACKING_PROGRESS_SOURCE` parsing and the 3-mode branching (legacy/shadow/persisted) from `resolve-route-progress.ts`. Always use the persisted pointer path with self-heal fallback.

**Rationale**: With GPS inference removed, the write side always produces correct persisted pointers via device geofence or manual confirm. The legacy time-floor selection and shadow dual-compute modes are no longer needed. The self-heal (lines 210-248) is retained as a safety net.

**What stays**:
- Four-tier pointer validation (exists, pending, age < 120min, adjacent)
- Self-heal fallback when pointer is invalid (derive from contiguous prefix, log `progress_pointer_healed`)
- Contiguous passed prefix filter (lines 144-161)
- Orphaned shift detection
- `trackingStatus` vs `runStatus` split

**What's removed**:
- `parseProgressSource()` function
- `process.env.TRACKING_PROGRESS_SOURCE` read
- Legacy mode branch (computeEta without targetStopId as primary path)
- Shadow mode branch (dual compute + mismatch logging)
- `progress_source_mismatch` log event
- `progress_source_fallback` log event (replaced by `progress_pointer_healed`)

**Cleanup**:
- Remove from `.env.local.example`
- Remove from `docs/OPERATIONS.md`

---

## R6: Mobile Config Resync Fix

**Decision**: Chain `registerGeofencesFromCache()` after successful `fetchTrackerConfig()` in the configVersion mismatch handler.

**Rationale**: Today, `client.ts:110` calls `fetchTrackerConfig(settings).catch(() => {})` fire-and-forget. The fetch stores new regions in AsyncStorage but never re-registers them with the OS. Adding `.then(() => registerGeofencesFromCache())` bridges this gap.

**Side effects analysis**: Safe. `Location.startGeofencingAsync()` can be called while tracking is active — it simply replaces the registered regions. No permissions needed (already granted). No effect on the background location task.

**Code change** (in `apps/van-tracker/src/api/client.ts:110`):
```typescript
// Before:
fetchTrackerConfig(settings).catch(() => {});

// After:
fetchTrackerConfig(settings)
  .then(() => registerGeofencesFromCache())
  .catch(() => {});
```

**Import needed**: `registerGeofencesFromCache` from `@/location/tracking`.

---

## R7: Geofence Radius Standardization

**Decision**: In `tracker-config/[vanId]/route.ts`, aggregate `device_geofence_radius_m` across grouped entries using `Math.max(100, Math.min(minRadius, 150))` with default 150m.

**Rationale**: Today, the first-seen entry's radius is used per group (line 82). If grouped entries have different radii, the result is non-deterministic (depends on query order). Using the minimum ensures the tightest boundary, and clamping to 100-150m prevents device-side issues with tiny or huge geofences.

**Implementation**:
1. Collect all non-null `device_geofence_radius_m` values per group key
2. If any values: effective = `Math.max(100, Math.min(...values, 150))`
3. If all null: effective = 150 (default)
4. If values disagree (not all equal): `console.warn()` with structured JSON

---

## R8: Reconciliation Script

**Decision**: Create a one-time Node.js script (runnable via `npx tsx`) that repairs active runs.

**Rationale**: During rollout, active runs may have GPS-inferred progress with non-contiguous state or missing pointers. The script seeds missing `route_run_stops`, runs `persistCanonicalProgress()` on each active run, and reports repairs.

**Scope**: Runs with `in_progress` status (has active shift with `ended_at IS NULL`) on the current service date. Not a migration — a manual ops script.
