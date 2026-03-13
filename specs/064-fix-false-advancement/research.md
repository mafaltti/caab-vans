# Research: Prevent False Stop Advancement

**Feature**: 064-fix-false-advancement
**Date**: 2026-03-11

## R1: Contiguous-Prefix Guard Placement

**Decision**: Insert the `matchedIndex` check between the confidence computation (line 253) and the mark-as-passed block (line 256) in `process-device-geofence-events.ts`.

**Rationale**: The `pendingStops` array is already sorted by `stop_sequence` (lines 186-190). The `matchedIndex = pendingStops.findIndex(...)` call already exists at line 276 inside the backfill block. Moving it upstream and gating the write behind `matchedIndex === 0` is the minimal change that prevents non-contiguous advancement.

**Alternatives considered**:
- Adding a new `deferred` status to `tracking_geofence_events`: Rejected — schema change out of scope, `received` already supports retry semantics.
- Performing the check in `route.ts` only (ack-side): Rejected — would still write non-contiguous `passed` rows, relying on healing to fix them. Prevention is better than correction.

## R2: Defense-in-Depth in `appendGeofenceResponse`

**Decision**: Reuse the existing `enforceCanonicalPrefix` helper (58 lines, `src/lib/tracking/enforce-canonical-prefix.ts`) inside `appendGeofenceResponse` to compute `contiguousPassedIds` and filter acked events.

**Rationale**: The helper is already tested and used in `infer-stop-progress.ts` (line 401) and `resolve-route-progress.ts` (line 148). Reusing it avoids duplicating contiguity logic. It accepts a `SortedStop[]` array and returns `{ contiguousPassedIds, healIds, lastPassedStopId, nextStopId }`.

**Alternatives considered**:
- Inline contiguity check in `route.ts`: Rejected — DRY violation (would be 3rd implementation of the same walk algorithm).
- Skip route.ts hardening entirely: Rejected — leaves a gap for race conditions and legacy corrupted data.

## R3: Gap-1 Backfill Removal Safety

**Decision**: Remove the entire backfill block (lines 275-299) with no replacement logic.

**Rationale**: The backfill was a heuristic that assumed if stop B fired, stop A (immediately before) was likely passed. This assumption breaks for dense downtown segments where road geometry enters a later stop's geofence first. The spec explicitly requires no backfill (FR-002). Deferred events will naturally resolve via retry when the earlier stop is confirmed by its own geofence event.

**Alternatives considered**:
- Reducing backfill confidence threshold instead of removing: Rejected — lower confidence doesn't prevent the false advancement; it just marks it with less certainty.
- Backfilling only when GPS corroborates: Rejected — adds complexity; the contiguous-prefix guard is simpler and more robust.

## R4: Test Strategy for Route Handler

**Decision**: Extract `appendGeofenceResponse` as a standalone testable function (it already is — it's a named inner function at line 238 of `route.ts`). Create unit tests for it by mocking Supabase queries, without full HTTP scaffolding.

**Rationale**: No route-handler test infrastructure exists today. Building full `NextRequest`/`NextResponse` mocks for a single function is over-engineering. The function takes `(supabase, submittedEventIds, response)` and can be tested by mocking only the Supabase client.

**Alternatives considered**:
- Full HTTP integration tests with `next/test-utils`: Rejected — YAGNI for this hotfix scope.
- Skip route.ts tests entirely: Rejected — the defense-in-depth logic is new and must be verified.

## R5: Deferred Event Observability

**Decision**: Use `console.warn` with a structured JSON payload containing: `vanId`, `runId`, `eventId`, `placeId`, `matchedScheduleEntryId`, `firstPendingScheduleEntryId`, `matchedSequence`, `firstPendingSequence`.

**Rationale**: The codebase uses `console.error` for failures and `console.warn`/`console.log` for operational signals. A deferred event is not an error — it's expected behavior on dense segments. `warn` level ensures visibility without polluting error monitoring.

**Alternatives considered**:
- Adding a `deferred_count` metric: Rejected — no metrics infrastructure exists; structured logs are sufficient for initial monitoring.
- Using `console.error`: Rejected — deferred events are expected, not errors.
