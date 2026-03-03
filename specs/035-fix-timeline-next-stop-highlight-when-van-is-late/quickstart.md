# Quickstart: Fix Timeline Next-Stop Highlight

## What to change

| File | Change |
|------|--------|
| `src/components/public/schedule-timeline.tsx` | Reorder ternary in `deriveTimelineStops` (line 52-58): check `inferredNextStopId` before `time < serverTime` |
| `src/__tests__/components/schedule-timeline.test.ts` | Add test: late van (next stop time < serverTime) still highlighted as "current" |

## The fix

In `deriveTimelineStops`, inside the `passedStopIds` branch (line 52-58), change:

```typescript
// Before:
status: passedSet.has(entry.id) || (serverTime && entry.time < serverTime)
  ? ("past" as TimelineStopStatus)
  : entry.id === inferredNextStopId
    ? ("current" as TimelineStopStatus)
    : ("future" as TimelineStopStatus),

// After:
status: entry.id === inferredNextStopId
  ? ("current" as TimelineStopStatus)
  : passedSet.has(entry.id) || (serverTime && entry.time < serverTime)
    ? ("past" as TimelineStopStatus)
    : ("future" as TimelineStopStatus),
```

## How to test

1. Start dev server: `npm run dev`
2. Run `set -a && source .env.local && set +a && npx tsx scripts/simulate-tracking.ts` to send GPS pings
3. Open a route detail page when a van is late (scheduled time < current time)
4. Verify the hero card and timeline both highlight the same next stop
5. Run tests: `npx vitest run src/__tests__/components/schedule-timeline.test.ts`

## Quality gates

```bash
npm run lint
npm run typecheck
npm run build
npx vitest run
```
