# Quickstart: Fix ETA & Next Stop Time-Awareness

**Feature**: 019-fix-eta-next-stop

## What This Fix Does

Fixes a bug where the schedule timeline shows the wrong "next stop" (CAAB @ 00:00 with ~0 min ETA) when a van starts GPS tracking mid-route. Three functions are patched to consider current time when selecting the next pending stop.

## Files to Modify

1. **`src/lib/tracking/eta.ts`** — `computeEta()`
   - Filter `pending` stops to only those with `time >= nowHHmm` before sorting and picking the first one.

2. **`src/lib/tracking/infer-stop-progress.ts`** — `inferStopProgress()`
   - In the result-building loop (step 7), only assign `nextStopId` from pending stops whose `time >= nowHHmm`.

3. **`src/components/public/schedule-timeline.tsx`** — `deriveTimelineStops()`
   - Add `serverTime` parameter.
   - In the GPS branch (`passedStopIds.length > 0`), classify a stop as "past" if it's in `passedSet` OR `stop.time < serverTime`.

4. **`src/app/(public)/routes/[routeId]/page.tsx`** — Route detail page
   - Pass `serverTime={data?.serverTime}` to `<ScheduleTimeline>`.

## How to Test

1. Ensure a route has a full-day schedule (stops from 00:00 to 23:40).
2. Start GPS tracking from the Expo tracker app mid-day (e.g., at 22:00).
3. Open the route detail page in a browser.
4. **Before fix**: Timeline shows CAAB @ 00:00 as current stop with ~0 min ETA.
5. **After fix**: Timeline shows the correct upcoming stop (first stop >= current time) with a realistic ETA. Hero card and timeline agree.

## Quality Gates

```bash
npx eslint .
npx tsc --noEmit
npx next build
npx vitest run
```
