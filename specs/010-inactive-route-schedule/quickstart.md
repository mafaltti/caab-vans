# Quickstart: Inactive Route Schedule Display

## What This Feature Does

Changes the route detail page so that when a route is out of operation, the full schedule is shown immediately with neutral styling — instead of hiding all stops behind a "Ver X paradas anteriores" collapsible button.

## Files to Modify

1. **`src/types/index.ts`** — Add `"neutral"` to `TimelineStopStatus`
2. **`src/components/public/schedule-timeline.tsx`** — Accept `isRunning` prop, handle neutral display mode
3. **`src/app/(public)/routes/[routeId]/page.tsx`** — Pass `isRunning` to `ScheduleTimeline`

## How to Test

1. Run the dev server: `npm run dev`
2. Navigate to a route detail page when the route is not running (outside operating hours or van location not updated today)
3. Verify: all stops visible immediately, no collapsible button, neutral dot styling
4. Navigate to a route detail page when the route IS running
5. Verify: past stops hidden behind collapsible, current stop has blue pulsing dot, future stops have neutral dots — same as before

## Quality Gates

```bash
npx eslint .
npx tsc --noEmit
npm run build
npx vitest run
```
