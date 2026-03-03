# Research: Fix Timeline Next-Stop Highlight

## Root Cause Analysis

### Decision: Condition reorder in `deriveTimelineStops` (Approach A)

**Rationale**: The bug is in `src/components/public/schedule-timeline.tsx` line 52-58, inside the `passedStopIds` branch of `deriveTimelineStops`. The ternary condition evaluates `entry.time < serverTime` before `entry.id === inferredNextStopId`. When a van is late (scheduled time already passed), the time check short-circuits to "past" and the tracking-based next stop ID is never consulted.

The fix is to promote the `inferredNextStopId` check to the top of the ternary chain:

```
// Before (buggy):
status: passedSet.has(entry.id) || (serverTime && entry.time < serverTime)
  ? "past"
  : entry.id === inferredNextStopId ? "current" : "future"

// After (fixed):
status: entry.id === inferredNextStopId
  ? "current"
  : passedSet.has(entry.id) || (serverTime && entry.time < serverTime)
    ? "past"
    : "future"
```

### Alternatives considered

| Approach | Description | Rejected Because |
|----------|-------------|------------------|
| B. API fix | Always populate `nextStop.id` | Already done in spec 027. API is correct; bug is frontend-only. |
| C. Remove frontend fallback | Remove `page.tsx` lines 54-61 fallback matching | Would break non-tracked routes that have no `progress.nextStopId`. |
| D. Bug #2 defensive fix | Change lines 62-66 to mark stops as "future" instead of "past" when `nextStopId` is null | Low-impact edge case, rarely reachable since `!isRunning` guard fires first. Can be deferred. |

## Prior Art

- **Spec 027** (`specs/027-fix-next-stop-mismatch/`): Fixed the API-level mismatch between schedule-based and geofence-based next stop. Added `resolveNextStop()` override in both route API handlers. That spec assumed `schedule-timeline.tsx` already worked correctly — this assumption was wrong.

## Test Gap Analysis

Existing tests in `src/__tests__/components/schedule-timeline.test.ts` (5 tests) all use `serverTime = "22:35"` with `inferredNextStopId = "stop-2240"` (time 22:40). Since 22:40 > 22:35, the next stop is never in the "late" state. Missing coverage:

1. **Late van**: `inferredNextStopId` points to a stop whose time < `serverTime`
2. **Very late van**: Multiple stops have time < `serverTime`, only one is `inferredNextStopId`
3. **runStatus "waiting"** and **"completed"** paths
4. **`!nextStopId` fallback** (lines 62-66)
