# Research: Fix ETA Segment Distance After Stop Skip

## R1: How are skipped stops currently handled in the ETA pipeline?

**Decision**: Skipped stops are filtered out in `resolve-route-progress.ts:294` before the stops array is passed to `computeEta()`. The ETA function never sees skipped stops.

**Rationale**: The original design assumed skipped stops should be invisible to ETA computation. This works for the GPS branch (which computes distance from live position) but breaks the segment branch (which accumulates pre-stored distances between sequential stops).

**Alternatives considered**:
- Pass a separate `allStops` parameter for segment accumulation → rejected (adds parameter complexity for no benefit)
- Recompute OSRM distances at runtime when gaps are detected → rejected (adds I/O to a fast fallback path)

## R2: Is summing stored distances correct when stops are skipped?

**Decision**: Yes. Summing `osrmDistanceM` across intermediate stops (including skipped ones) gives the correct along-route distance.

**Rationale**: Each stop's `osrmDistanceM` stores the OSRM road distance to the next sequential stop. The van follows the route sequentially regardless of whether it stops at a particular location. So `dist(A→B) + dist(B→C) = dist(A→C along route)`, even if B is skipped. This is more accurate than a direct OSRM call from A to C, which might suggest a shortcut the van won't take.

**Alternatives considered**:
- Direct OSRM call between endpoints → rejected (different route possible, adds I/O, OSRM is optional)
- Haversine fallback × road factor → rejected (less accurate than stored OSRM segments)

## R3: What happens to other `computeEta()` logic when skipped stops are included?

**Decision**: No other logic is affected. All critical paths filter by `status === "passed"` or `status === "pending"`, naturally excluding skipped stops.

**Rationale**: Verified all uses of the `stops` array in `computeEta()`:
- Line 72: `passed = stops.filter(s => s.status === "passed")` — excludes skipped
- Line 73: `pending = stops.filter(s => s.status === "pending")` — excludes skipped
- Line 267: `sortedAllForSegment = [...stops].sort(...)` — includes skipped (desired for distance accumulation)
- Line 268: `sortedPassedForSegment = sortedAllForSegment.filter(s => s.status === "passed")` — excludes skipped
- `scheduleDelayFallback`: filters for passed stops — excludes skipped

## R4: What should happen when segment ETA is past but schedule is future?

**Decision**: Fall through to `scheduleDelayFallback()` which computes ETA from the observed delay pattern.

**Rationale**: The schedule fallback uses the delay observed at the last-passed stop and projects it forward. This gives a meaningful estimate. Returning "0 min" is misleading; returning "overdue" is incorrect (the scheduled time hasn't passed). The schedule fallback is the appropriate intermediate state.

**Alternatives considered**:
- Return a new status like "recalculating" → rejected (adds UI complexity, YAGNI)
- Return the scheduled time directly → rejected (ignores observed delay, less accurate than `scheduleDelayFallback`)
