# Quickstart: Reduce Polling Intervals

**Feature**: 034-reduce-polling-intervals
**Date**: 2026-03-03

## What to change

Update the `refetchInterval` value in three TanStack Query hooks:

| File | Current | Target |
|------|---------|--------|
| `src/lib/queries/use-routes.ts` | `15_000` (15s) | `5_000` (5s) |
| `src/lib/queries/use-route-detail.ts` | `15_000` (15s) | `5_000` (5s) |
| `src/lib/queries/use-announcements.ts` | `60_000` (60s) | `30_000` (30s) |

## How to verify

1. Start the dev server: `npm run dev`
2. Open the route list page in browser DevTools → Network tab
3. Confirm `/api/routes` requests fire every ~5 seconds
4. Navigate to a route detail page
5. Confirm `/api/routes/[id]` requests fire every ~5 seconds
6. Return to main page and confirm `/api/announcements` requests fire every ~30 seconds

## Quality gates

```bash
npx eslint .
npx tsc --noEmit
npx next build
npx vitest run
```
