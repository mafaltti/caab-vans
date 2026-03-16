# ETA Bug Analysis

## Bug 1: Segment Distance Wrong After Skips

**Root cause in code:** `eta.ts:283-288`

The `osrm_distance_m` field on each `schedule_entry` is pre-computed by `scripts/precompute-stop-distances.ts` as the road distance from that stop to its immediate next neighbor in the original route sequence.

When a stop is skipped:

1. `resolve-route-progress.ts:294` filters it out: `.filter((rs) => rs.status !== "skipped")`
2. The filtered array `[#13, #15]` is passed to `computeEta()`
3. The segment loop at `eta.ts:283-288` sums `osrmDistanceM` from index `lastPassedIdx` to `nextStopIdx`
4. It reads stop #13's `osrmDistanceM` = `1141.1m` — but this is the precomputed distance `#13 → #14`, not `#13 → #15`

The stored distance is stale/wrong because it was computed against the original neighbor, not the actual next pending stop.

### Fix Approach

When accumulating segment distances, the loop must detect that the stored OSRM distance on stop `i` points to a different neighbor than `sortedAllForSegment[i+1]`. Two options:

- **Option A (runtime recalculation):** When `has_skipped_stops` is true, call OSRM at runtime for the gap segments that span a skip. This gives accurate road distances but adds an HTTP call.
- **Option B (sum through skipped stops):** Instead of filtering skipped stops out before passing to `computeEta`, keep them in the array but mark them. The segment accumulation loop would then sum through skipped stops (`#13 → #14` + `#14 → #15`), giving a correct total distance ~6 km. This is simpler and needs no network calls.

**Option B is clearly better** — it uses already-stored data, requires no OSRM call, and the only inaccuracy (routing through a stop that won't actually be visited) is negligible since the van takes approximately the same road.

---

## Bug 2: 0 min Instead of Overdue/Recalc

**Root cause in code:** `eta.ts:302` and `eta.ts:314`

```ts
// Line 302: overdue guard
if (etaDateTime <= now && scheduledTime <= now) { ... return "overdue" }

// Line 314: clamp to 0
const etaNextStopMinutes = Math.max(0, Math.ceil(etaDateTime.diff(now, "minutes").minutes));
```

When `etaDateTime` is in the past (10:25) but `scheduledTime` is in the future (10:55):

- The overdue guard at line 302 fails (second condition false)
- Execution falls through to line 314 which clamps the negative diff to `0`
- Returns `etaStatus: "estimated"` with `etaNextStopMinutes: 0` — misleading

### Fix Approach

When `etaDateTime <= now` but `scheduledTime > now`, the segment result is clearly wrong (distance was too short). Instead of clamping to `0`, it should fall through to the `scheduleDelayFallback` at line 329, which uses the scheduled arrival time + observed delay — a much more reasonable estimate.

```ts
// Replace the current flow with:
if (etaDateTime <= now && scheduledTime <= now) {
  return { ... etaStatus: "overdue" };
}
if (etaDateTime <= now) {
  // Segment ETA is in the past but scheduled time is future —
  // segment distance is wrong (likely due to skip). Fall through.
  break; // or just don't return, let it reach scheduleDelayFallback
}
```

---

## Summary

| Bug | Location | Root Cause | Fix |
|---|---|---|---|
| #1 Distance wrong | `eta.ts:283-288` | `osrmDistanceM` points to original neighbor, not actual next after skip | Keep skipped stops in segment array so distances sum correctly |
| #2 Clamp to 0 | `eta.ts:302-314` | Overdue guard requires both conditions; false clamp when only ETA is past | Fall through to `scheduleDelayFallback` when segment ETA is past but schedule is future |
