# Quickstart: Tracking Simplification

**Feature**: 065-tracking-simplification
**Branch**: `065-tracking-simplification`

## Prerequisites

- Node.js 20+, pnpm
- Supabase running locally (`docker compose up` in `infra/supabase/`)
- Expo CLI for tracker app changes

## Key Files to Understand

Read these files first to understand the current system:

1. **`src/lib/tracking/enforce-canonical-prefix.ts`** — The pure function that computes contiguous passed prefix. This is the foundation the shared helper builds on.
2. **`src/lib/tracking/process-device-geofence-events.ts`** — Device geofence processing. Currently marks stops but doesn't persist pointers.
3. **`src/app/api/tracking/[vanId]/route.ts`** — Main tracking route. Lines 213-226 call `inferStopProgress()` (to be removed). Lines 228-244 are the deferred retry branch (to be removed).
4. **`src/lib/tracking/resolve-route-progress.ts`** — Progress resolver. Lines 250-338 contain the 3-mode branching (to be collapsed).

## Development Flow

### 1. Extract shared helper

Create `src/lib/tracking/persist-canonical-progress.ts`:
- Fetch `route_run_stops` for run, ordered by `stop_sequence`
- Call `enforceCanonicalPrefix()`
- Heal non-contiguous rows
- Persist `last_passed_stop_id`, `next_stop_id`, `progress_updated_at` on `route_runs`
- Write tests in `src/__tests__/tracking/persist-canonical-progress.test.ts`

### 2. Wire into device geofence processing

In `process-device-geofence-events.ts`, after marking a stop as passed (line ~305), call `persistCanonicalProgress()`. This is the critical wiring that must land before removing GPS inference.

### 3. Seed stops at shift start

In `routes/[routeId]/start/route.ts`, after run creation, call `seedRouteRunStops()` + `persistCanonicalProgress()`.

### 4. Remove GPS inference calls

Remove `inferStopProgress()` calls from:
- `tracking/[vanId]/route.ts` (lines 213-226)
- `tracking-batch/[vanId]/route.ts` (lines 220-237)
- Also remove the deferred retry branch (lines 228-244 in main route)

### 5. Simplify progress resolver

In `resolve-route-progress.ts`, remove `TRACKING_PROGRESS_SOURCE` parsing and 3-mode branching. Always use persisted pointer with self-heal fallback.

### 6. Fix mobile config resync

In `apps/van-tracker/src/api/client.ts`, chain `registerGeofencesFromCache()` after `fetchTrackerConfig()` in the configVersion mismatch handler.

### 7. Standardize geofence radii

In `tracker-config/[vanId]/route.ts`, aggregate radii per group with `clamp(min, 100, 150)`.

## Running Tests

```bash
# All tracking tests
pnpm vitest run src/__tests__/tracking/

# Specific test suites affected
pnpm vitest run src/__tests__/tracking/process-device-geofence-events.test.ts
pnpm vitest run src/__tests__/tracking/resolve-route-progress.test.ts
pnpm vitest run src/__tests__/tracking/persist-canonical-progress.test.ts

# Full quality gate
pnpm lint && pnpm tsc --noEmit && pnpm vitest run && pnpm build
```

## Verification

After implementation, verify:

1. **GPS ping does not change stops**: Send a ping near a stop → check `route_run_stops` unchanged
2. **Device geofence updates pointers**: Send geofence event → check `route_runs.next_stop_id` updated
3. **Shift start seeds stops**: Start a shift → check `route_run_stops` rows exist and `next_stop_id` set
4. **Resolver ignores env var**: Set `TRACKING_PROGRESS_SOURCE=legacy` → verify behavior unchanged
5. **Deferred events retry naturally**: Send out-of-order geofence → verify deferral → send in-order → verify both processed
