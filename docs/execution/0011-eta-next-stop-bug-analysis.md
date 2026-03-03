# ETA / Next Stop Bug Analysis

## Root Cause

The bug is in how `computeEta` determines the "next stop". The chain:

1. `computeEta` (`src/lib/tracking/eta.ts:39-42`) picks the first pending stop sorted by time:

   ```ts
   const sortedPending = [...pending].sort((a, b) => a.time.localeCompare(b.time));
   const nextStop = sortedPending[0];
   ```

2. With the full-day schedule, stops at 00:00, 00:20, 00:40, etc. remain "pending" because the van never geofenced through them. So `nextStopId` = CAAB at 00:00.

3. `inferStopProgress` (`src/lib/tracking/infer-stop-progress.ts:134`) has the same pattern — `nextStopId` is the first pending stop in time order, ignoring what time it actually is.

4. The page (`src/app/(public)/routes/[routeId]/page.tsx:20`) prioritizes `progress.nextStopId` over the time-based next stop:

   ```ts
   const nextStopId = route?.progress?.nextStopId ?? (time-based fallback)
   ```

5. `deriveTimelineStops` (`src/components/public/schedule-timeline.tsx:32-42`) — when `passedStopIds` exist, it uses `inferredNextStopId` to mark the "current" stop, so CAAB at 00:00 gets the blue marker.

6. ETA shows ~0 min because `parseTime("00:00")` is midnight today, already in the past, and `Math.max(0, ...)` clamps it to 0.

## Why the Header Is Correct

The `HeroCard` uses `getNextStop()` from `src/lib/time.ts:43-55`, which is purely time-based — it finds the first stop where `time >= now`. This correctly returns Mundo Plaza at 22:40.

## Summary

The time-based logic (header) works fine. The GPS-progress-based logic (schedule list) assumes all earlier stops were physically geofenced as "passed" before reaching the current position. With a full-day schedule and tracking starting mid-day, all early-morning stops stay "pending" and the first one (CAAB 00:00) gets picked as "next".

### Two Places Need Fixing

- **`computeEta`** — should consider current time when picking the next pending stop
- **`inferStopProgress`** — should auto-mark past-time stops as "passed" (or skip them) when determining `nextStopId`
