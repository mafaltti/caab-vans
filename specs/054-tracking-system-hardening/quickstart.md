# Quickstart: Tracking System Hardening

## What This Feature Does

Closes five correctness gaps in the tracking system:

1. **Deterministic confidence** — evidence query fetched once, ordered, no arbitrary limit
2. **Consistent last-known summary** — `nextStopMode` discriminator, top-level fields populated
3. **Honest overdue ETA** — `etaStatus = "overdue"` instead of misleading `0 min`
4. **Monotonic snapped confidence** — tiered scoring (0.65–0.95) with evidence bonuses
5. **Orphaned shift cleanup** — reconciliation script auto-closes stale shifts

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/tracking/infer-stop-progress.ts` | Lift evidence query, remove limit, add order, new confidence tiers |
| `src/lib/tracking/eta.ts` | Add `etaStatus` field, return `null` minutes for overdue segment/schedule |
| `src/lib/tracking/resolve-route-progress.ts` | Pass `etaStatus` through to `RouteProgress` |
| `src/types/index.ts` | Add `etaStatus` to `RouteProgress`, add `nextStopMode` to response type |
| `src/app/api/routes/route.ts` | Populate `nextStop`/`currentStopIndex` for last-known, add `nextStopMode` |
| `src/app/api/routes/[routeId]/route.ts` | Same as above |

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/reconcile-orphaned-shifts.ts` | Standalone reconciliation script |

## Tests to Extend

| File | New Coverage |
|------|-------------|
| `src/__tests__/tracking/infer-stop-progress.test.ts` | >50 pings, single fetch, monotonic snapped scoring |
| `src/__tests__/tracking/eta.test.ts` | Overdue segment/schedule returns `etaStatus = "overdue"` |
| `src/__tests__/tracking/routes-api.test.ts` | `includeLastKnown` top-level summary, `nextStopMode` values |

## How to Run

```bash
# Quality gates
npm run lint
npx tsc --noEmit
npm run build
npm test

# Reconciliation (dry run)
DRY_RUN=1 npx tsx scripts/reconcile-orphaned-shifts.ts

# Reconciliation (live)
npx tsx scripts/reconcile-orphaned-shifts.ts
```

## No Schema Changes

All changes are application-level TypeScript. No database migrations needed.
