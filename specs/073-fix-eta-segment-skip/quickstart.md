# Quickstart: Fix ETA Segment Distance After Stop Skip

## Changes Overview

Two targeted fixes in the ETA computation pipeline. No new files, no new dependencies, no schema changes.

## Files to Modify

### 1. `src/lib/tracking/eta.ts`

**Change A** (Bug 1): Expand `Stop.status` union to include `"skipped"`:
```diff
- status: "pending" | "passed";
+ status: "pending" | "passed" | "skipped";
```

**Change B** (Bug 2): Add schedule fallback when segment ETA is past but schedule is future (around line 302):
```diff
  if (etaDateTime <= now && scheduledTime <= now) {
    return { ... etaStatus: "overdue" };
  }
+ else if (etaDateTime <= now) {
+   return scheduleDelayFallback(stops, passed, nextStop, nextStopId, passedStopIds, now);
+ }
```

### 2. `src/lib/tracking/resolve-route-progress.ts`

**Change C** (Bug 1): Remove the skipped-stop filter at line 294:
```diff
  const stops = effectiveRunStops
-   .filter((rs) => rs.status !== "skipped")
    .map((rs) => {
```

Update the status mapping to pass through the actual status including `"skipped"`:
```diff
- status: rs.status as "pending" | "passed",
+ status: rs.status as "pending" | "passed" | "skipped",
```

### 3. `src/__tests__/tracking/eta.test.ts`

Add test cases:
- Skipped stop between last-passed and target → segment distance sums through skipped
- Multiple consecutive skipped stops → distances accumulate correctly
- Segment ETA in past + scheduled time in future → falls back to schedule, not 0 min
- No skipped stops → behavior unchanged (regression guard)

## Verification

```bash
npx vitest run src/__tests__/tracking/eta.test.ts
npx eslint src/lib/tracking/eta.ts src/lib/tracking/resolve-route-progress.ts
npx tsc --noEmit
```
