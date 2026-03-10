# CAAB Vans — Tracking Hardening: Implementation Spec

## Summary

Fix the remaining tracking gaps with four code changes and one small schema change:

- Replay stop inference by accepted ping time, not latest-position time
- Make `route_run_stops` canonical on write instead of masking bad state on read
- Align ETA/passage position selection and confidence evidence
- Surface orphaned-shift health in the read path while keeping the reconciliation job
- Add batch-route coverage, which is currently the biggest blind spot

---

## Schema and Type Changes

- Add migration `supabase/migrations/00010_add_snapped_coords_to_van_location_pings.sql`:
  - `snapped_lat double precision null`
  - `snapped_lng double precision null`
- Extend `src/types/index.ts`:
  - Add `runHealth: "normal" | "orphaned"` to `RouteProgress`
- Do not change existing ETA or last-known API fields. `etaStatus` and `nextStopMode` already exist and stay as-is.

---

## Core Refactors

### `infer-stop-progress.ts` — Accept Event-Time Object Argument

Change `inferStopProgress` to accept an object argument:

- `supabase`
- `vanId`
- `rawLat`, `rawLng`
- `snappedLat`, `snappedLng`
- `eventTs` as ISO string

Inside inference:

- Derive `eventTime = DateTime.fromISO(eventTs).setZone("America/Bahia")`
- Derive `serviceDate` from `eventTime`, not `todayBahiaDate()`
- Use `eventTime` instead of `nowBahia()`
- Gate on a shift active at `eventTs`, not just `ended_at is null now`
- Set `passed_at = eventTs` for geofence passes and backfills
- Keep `progress_updated_at = processing time`

### `infer-stop-progress.ts` — Canonical Write Logic

Replace the current write-first-then-mask behavior with canonical write logic:

1. Load all run stops in schedule order
2. Compute candidate geofence matches for the current event
3. Compute candidate backfill ids only if confidence gate passes
4. Build `candidatePassedSet = existingPassed ∪ newMatches ∪ newBackfills`
5. Walk from the start of the route and keep only the contiguous passed prefix
6. Write only pending rows that enter that canonical prefix
7. Revert any stored `passed` rows outside the canonical prefix back to `pending` and clear `passed_at`/`pass_source`/`pass_confidence`
8. Persist `last_passed_stop_id` and `next_stop_id` from the canonical prefix only

### New: `src/lib/tracking/effective-position.ts`

Introduce a shared position-selection helper:

- Export one function that chooses `raw` vs `snapped` for a specific stop based on raw distance, snapped distance, and snap displacement threshold
- Use it in both `infer-stop-progress.ts` and `eta.ts`

### `eta.ts` — Carry Both Coordinate Sets

Update `VanPosition` to carry both raw and snapped coordinates:

- Route APIs construct `VanPosition` with `rawLat/rawLng` and `snappedLat/snappedLng`
- GPS ETA uses the shared effective-position helper for the active target stop
- Public map/display coordinates can stay snapped for now

---

## Ingestion and OSRM Changes

### `src/lib/tracking/osrm.ts`

Replace the current last-point-only OSRM helper with:

- `matchTrajectory(coords, osrmBaseUrl): Array<{ lat: number; lng: number } | null> | null`
- Keep `snapToRoad()` as a thin wrapper if needed for compatibility

### `src/app/api/tracking/[vanId]/route.ts`

- After a successful upsert, always run stop inference for that accepted ping, even if `update_van_position` returns false
- Compute snapped coords for the accepted ping and write them back to `van_location_pings.snapped_lat/snapped_lng`
- Continue updating the van's latest position only when the RPC accepts the ping

### `src/app/api/tracking-batch/[vanId]/route.ts`

- Keep accepted points in chronological order
- OSRM-match the accepted trajectory and persist snapped coords for each accepted ping
- Replay `inferStopProgress()` sequentially for every accepted non-duplicate point using its own `eventTs`
- Call `update_van_position` only once for the newest accepted point
- Do not parallelize replay — order matters

### Confidence Evidence Query

- Remove the 50-row cap from the inference evidence query
- Query the full 5-minute window ordered by `device_ts desc, id desc`
- For raw candidates, confirming pings are counted with raw coordinates
- For snapped candidates, confirming pings are counted only from pings with stored `snapped_lat/snapped_lng`

---

## Orphaned Shift Hardening

### New: `src/lib/tracking/orphaned-shift-health.ts`

- Extract the orphan criteria into a shared helper
- Reuse the same thresholds already in `scripts/reconcile-orphaned-shifts.ts`: 90 minutes past schedule end and 30 minutes inactivity

### Updates

- Update both `scripts/reconcile-orphaned-shifts.ts` and `src/lib/tracking/resolve-route-progress.ts` to use the shared helper
- In `resolveRouteProgress`, set `runHealth = "orphaned"` when an open shift satisfies orphan criteria
- Keep `runStatus` semantics unchanged — this is observability, not a silent status rewrite

---

## Tests

### New: `src/__tests__/tracking/tracking-batch.test.ts`

- Earlier buffered point crosses a stop and later point does not: progress must still advance
- Replay is chronological
- Replay still occurs when latest-position RPC returns false for older accepted points
- Per-point snapped coords are passed into inference

### Extend: `src/__tests__/tracking/infer-stop-progress.test.ts`

- Event-time service date is derived from `eventTs`
- Shift-active-at-event-time allows replay after shift end
- Low-confidence late match does not persist a non-contiguous `passed` row
- Previously corrupted non-contiguous `passed` rows are healed back to `pending`
- `passed_at` equals `eventTs`, not processing time
- Remove the old `.limit(50)` expectation
- Snapped corroboration uses `snapped_lat/snapped_lng`, not raw-only evidence

### Extend: `src/__tests__/tracking/eta.test.ts`

- ETA and passage choose the same effective position for the active stop
- Raw-preferred and snapped-preferred cases both behave as expected

### Extend: `src/__tests__/tracking/resolve-route-progress.test.ts`

- `runHealth = "orphaned"` when criteria are met
- `runHealth = "normal"` otherwise

---

## Rollout

1. Deploy migration first.
2. Deploy app changes that write `snapped_lat/snapped_lng`.
3. Enable batch replay and canonical write logic together — they depend on event-time inference.
4. Keep the reconciliation scheduler in place and update `docs/OPERATIONS.md` to treat `tracking:reconcile-shifts` as required runtime, not optional maintenance.

---

## Assumptions

- No separate evidence table is added in this iteration; `route_run_stops` becomes canonical state only.
- Displayed map position remains snapped-first; the correctness fix is for ETA and stop progression.
- Batch size stays capped at 100, so sequential replay is acceptable.
