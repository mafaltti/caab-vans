# isRunning Bug — Status Without Active Shift

## QUESTION: Now that 10 minutes passed it went to "Aguardando Inicio" but when I turn tracking in the tracker app again it returns to "Em operação" even without a driver start route.

The bug is on line 84 of both API routes (`/api/routes/route.ts` and `/api/routes/[routeId]/route.ts`):

```typescript
const isRunning = withinWindow && locationFresh;
```

`isRunning` only checks:

1. Is it within the schedule window (06:10–18:00)?
2. Is GPS location fresh (< 10 min old)?

It **never checks whether a driver has actually started a shift**. The `runStatus` (which tracks shifts) is computed further down in the code but is never fed back into `isRunning`.

## What Happens

- **Tracker on, no active shift** → GPS is fresh → `isRunning = true` → "Em operação" (wrong)
- **Tracker off for 10+ min** → GPS stale → `isRunning = false` → "Aguardando Início" (correct, but for the wrong reason)
- **Driver starts shift, tracker on** → `isRunning = true` → "Em operação" (correct, but only by coincidence)

## The Fix Needed

`isRunning` should also require `runStatus === "in_progress"` (i.e., an active shift with `ended_at === null`). The calculation needs to move down in both files to after the shift data is fetched, or the shift status check needs to be hoisted up.

Both files (`route.ts` and `[routeId]/route.ts`) have the identical issue.
