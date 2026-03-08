# Research: Progress Pointer Correctness Fixes

**Date**: 2026-03-08

## Decision Log

### D1: Multi-Segment Distance Accumulation Strategy

**Decision**: Sum intermediate `osrmDistanceM` values from last-passed stop through to target stop. If any intermediate segment is missing, fall back entirely to schedule-based ETA.

**Rationale**: All stops in the `stops` array already carry `osrmDistanceM` (populated from `resolve-route-progress.ts:159-164` via an `osrmDistances` Map). The data is available — the current code simply doesn't sum intermediate segments.

**Alternatives considered**:
- Partial accumulation (haversine for missing segments): Rejected — mixes road distance with straight-line, produces unreliable estimates.
- Single OSRM route query for full remaining path: Rejected — adds latency and OSRM dependency for every ETA computation.

### D2: Pointer Staleness Architecture (30-min fresh + 2-hour ceiling)

**Decision**: Introduce a two-tier staleness model:
- `POINTER_STALENESS_MINUTES = 30` (existing) — defines "fresh" pointer, used directly.
- `POINTER_ABSOLUTE_CEILING_MINUTES = 120` (new) — defines maximum age for a stale-but-pending pointer.

Between 30 min and 2 hours: pointer is stale but still used if the target stop is pending.
Beyond 2 hours: pointer is treated as invalid regardless of stop status.

**Rationale**: Simply changing the staleness constant to 120 would affect shadow mode logging and other behaviors that rely on the "fresh" threshold. A two-tier approach preserves existing fresh/stale semantics while adding the ceiling.

**Alternatives considered**:
- Single 120-minute staleness: Rejected — loses the distinction between fresh and stale for logging/shadow mode.
- No ceiling: Rejected — a 6+ hour old pointer likely indicates a stuck pipeline, not a late van.

### D3: Default Progress Source Flip

**Decision**: Change `parseProgressSource()` default from `"legacy"` to `"persisted"`. One-line change at `resolve-route-progress.ts:272`.

**Rationale**: The persisted pointer pipeline is already writing data. The shadow mode has been available for comparison. Flipping the default completes the cutover.

**Alternatives considered**:
- Environment variable enforcement in deployment: Rejected — still requires manual config, which is the current problem.

### D4: Per-Stop Snap Evaluation Strategy

**Decision**: Move the snap-vs-raw decision inside the per-stop geofence check loop. For each candidate stop, compute distances from both raw and snapped positions, then use whichever is closer (within the 50m displacement threshold).

**Rationale**: The current global decision picks one coordinate source for all stops. Moving inside the loop adds one extra `haversineDistanceMeters` call per stop (negligible cost for 5-15 stops) but correctly handles mixed road/campus routes.

**Alternatives considered**:
- Per-stop metadata flag (road vs campus): Rejected — requires schema change and data entry, out of scope.
- Keep global but widen threshold: Rejected — doesn't solve the fundamental "one decision for all stops" problem.

### D5: Confidence Source Alignment Strategy

**Decision**: Cap snapped-passage confidence at 0.8 (both tiers) instead of re-snapping historical pings. Raw pings are still used for the confidence query, but snapped passages no longer receive inflated 1.0 confidence. Both snapped tiers (2+ pings and <2 pings) return 0.8. Raw passage tiers remain unchanged (0.9 / 0.7).

**Rationale**: The full approach (snapping each recent ping for the confidence query) would require a complex per-ping snap pipeline. Capping confidence at 0.8 is a one-line change that removes the false "high confidence" label while keeping raw pings as a conservative evidence bar. Aligns with KISS.

**Alternatives considered**:
- Snap each recent ping for confidence query: Rejected — complex pipeline for marginal accuracy gain over the cap approach.
- Document raw pings as intentional ground truth: Rejected — creates a logical inconsistency where "high confidence" can mean "no raw evidence supports this."

### D6: Backfill Gate Tightening

**Decision**: Remove the `gap <= 1` unconditional exception. The gate becomes simply `maxPassedConfidence > 0.7`. This means single-stop backfill requires the same evidence bar as multi-stop backfill.

**Rationale**: The `gap <= 1` exception was a pragmatic compromise. With improved per-stop snap (D4) and confidence alignment (D5), the confidence scores are more reliable and the exception is no longer needed.

**Alternatives considered**:
- Lower the threshold to `>= 0.7` for gap=1: Rejected — 0.7 is the minimum score (single raw ping, no snap), which is exactly the noisy case we want to gate.
- Add a ping count minimum instead: Rejected — more complex; confidence already encodes ping count.

### D7: Route-Order Fallback in Legacy/Persisted Modes

**Decision**: When the pointer is invalid/stale and no `targetStopId` is set, `computeEta` should fall back to the first pending stop by route order (schedule sequence) instead of filtering by `time >= now`. This prevents losing all stops when the van is late.

**Rationale**: The time-floor filter (`time >= now`) is the root cause of the "all overdue stops disappear" bug. Route order (schedule sequence) is always available and stable.

**Alternatives considered**:
- Remove time-floor filtering entirely: Rejected — time-floor is still useful when the pointer is not available and the van is on-time (prevents showing already-served stops).
- Use time-floor with a grace period: Rejected — still fails for very late vans; grace period is arbitrary.

**Refined approach**: Keep time-floor as first attempt; if it yields no stops, fall back to first pending by route order.

## Code Locations Summary

| File | Key Lines | Changes |
|------|-----------|---------|
| `src/lib/tracking/eta.ts` | 237-260 | Multi-segment accumulation; route-order fallback |
| `src/lib/tracking/resolve-route-progress.ts` | 81-93, 168-185, 270-273 | Default flip; 2-tier staleness; includeLastKnown |
| `src/lib/tracking/infer-stop-progress.ts` | 148-163, 196-201, 236-261, 315-320 | Per-stop snap; confidence alignment; backfill gate |
| `src/lib/time.ts` | 15 | New POINTER_ABSOLUTE_CEILING_MINUTES constant |
| `src/app/api/routes/route.ts` | Handler | Pass includeLastKnown param |
| `src/app/api/routes/[routeId]/route.ts` | Handler | Pass includeLastKnown param |

## Test Files Requiring Updates

| File | Lines | Reason |
|------|-------|--------|
| `src/__tests__/tracking/eta.test.ts` | 935-1140 | Add multi-segment tests; route-order fallback tests |
| `src/__tests__/tracking/resolve-route-progress-modes.test.ts` | 340-372, 459 | Update default mode; add 2-tier staleness tests |
| `src/__tests__/tracking/resolve-route-progress.test.ts` | 244-269, 296-380 | Stale pointer ceiling; includeLastKnown tests |
| `src/__tests__/tracking/infer-stop-progress.test.ts` | 1428-1555, 1601-1750 | Per-stop snap; confidence alignment; backfill gate |
