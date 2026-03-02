# Quickstart: Faster Polling Intervals

**Feature**: 028-faster-polling
**Date**: 2026-03-02

## What This Changes

Reduces polling intervals for route data from 60s/30s to 15s, reduces stale time from 30s to 10s, and enables automatic refresh when the browser tab regains focus.

## Files to Modify (3 files, 5 value changes)

1. **`src/app/providers.tsx`** — Global QueryClient config
   - `staleTime`: `30 * 1000` → `10 * 1000`
   - `refetchOnWindowFocus`: `false` → `true`

2. **`src/lib/queries/use-routes.ts`** — Routes list hook
   - `refetchInterval`: `60_000` → `15_000`

3. **`src/lib/queries/use-route-detail.ts`** — Route detail hook
   - `refetchInterval`: `30_000` → `15_000`

## What NOT to Change

- `src/lib/queries/use-announcements.ts` — stays at `60_000` (announcements are infrequent)

## How to Test

1. Start the dev server: `npm run dev`
2. Open the routes list in a browser
3. In another tab/session, start or end a driver route via the API
4. Confirm the routes list updates within ~15 seconds
5. Switch away from the app tab, wait 20+ seconds, switch back — confirm immediate refresh
6. Open browser DevTools Network tab — confirm requests fire every ~15s (not piling up)

## Quality Gates

```bash
npx eslint .
npx tsc --noEmit
npx next build
npx vitest run
```
