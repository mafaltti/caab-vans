# Quickstart: Fix Timeline Past Stops

## Prerequisites

- Node.js installed
- Repository cloned, on branch `036-fix-timeline-past-stops`

## Files to Modify

1. **`src/components/public/schedule-timeline.tsx`** — `deriveTimelineStops()` function (lines 50–60)
   - Replace the flat `passedSet.has(entry.id) || (serverTime && entry.time < serverTime)` condition with index-aware logic
   - Find `inferredNextStopId` index in the schedule array
   - Use index as boundary: before → past, current → current, after → future
   - Preserve GPS-confirmed always-past and time-based fallback when no current index

2. **`src/__tests__/components/schedule-timeline.test.ts`** — Add regression test
   - New test: "stops after current next stop are future even when their time < serverTime"
   - Update existing test "classifies un-geofenced past-time stops as past (hybrid)" if its assertions conflict (they shouldn't — all its time-fallback stops are before the current stop)

## Verify

```bash
# Run tests
npx vitest run src/__tests__/components/schedule-timeline.test.ts

# Type check
npx tsc --noEmit

# Lint
npx eslint src/components/public/schedule-timeline.tsx

# Build
npx next build
```

## How to Manually Test

1. Open a route where the van is running late (next stop's scheduled time is well past)
2. Verify stops after the highlighted "next stop" show empty circles (future), not gray checkmarks (past)
3. Toggle "hide previous stops" — count should match only truly passed stops
4. Verify an on-time route still behaves correctly (no regression)
