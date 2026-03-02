# Quickstart: Fix Status Inconsistency

**Branch**: `029-fix-status-inconsistency` | **Date**: 2026-03-02

## Prerequisites

- Node.js + pnpm installed
- Local dev environment running (`pnpm dev`)
- At least one van with a route and schedule entries in the database
- Access to Supabase Studio to verify route_runs/route_shifts data

## Testing the Fix

### Setup test scenarios

1. **Van with active shift + GPS fresh** (should show "Em operação" green badge, blue hero card):
   - Ensure a route_run exists for today
   - Ensure a route_shift exists with `ended_at = NULL`
   - Van has fresh GPS data (location_updated_at < 10 min ago)

2. **Van with active shift + GPS stale** (should show "Em operação" green badge, blue hero with GPS warning):
   - Ensure a route_shift exists with `ended_at = NULL`
   - Van has stale GPS data (location_updated_at > 10 min ago)

3. **Van between shifts + GPS fresh** (should show "Em operação" green badge, blue hero card):
   - Ensure a route_run exists with all shifts having `ended_at` set
   - Still within schedule window
   - Van has fresh GPS data

4. **Van between shifts + GPS stale** (should show "Aguardando início" amber badge, amber hero):
   - Ensure a route_run exists with all shifts having `ended_at` set
   - Still within schedule window
   - Van has stale GPS data (or no GPS data)

5. **Van with no shift started** (should show "Aguardando início" amber badge, amber hero):
   - Ensure a route_run exists for today with no shifts, OR no route_run at all
   - Van is within schedule window

6. **Van with route_run but no shifts + schedule ended** (should show "Fora de operação" zinc badge, "Programação encerrada" hero):
   - Ensure a route_run exists with no shifts (or all shifts ended)
   - Current time is past the last scheduled stop

7. **Van completed for the day** (should show "Encerrada" emerald badge, "Rota encerrada" hero):
   - Ensure all shifts ended AND schedule window has passed
   - This requires `runStatus === "completed"` (all shifts done + past schedule)

8. **Van outside schedule entirely** (should show "Fora de operação" zinc badge, "Fora de operação" hero):
   - Current time is before first stop or after last stop with no run history

### Verification steps

1. Open the route list page (`/`)
2. Verify each van's badge matches its expected state per the scenario
3. Tap into each route's detail page
4. Verify the **header badge** matches the list badge
5. Verify the **hero card** message is consistent with the badge (see data-model.md full state matrix)
6. Check that no two components on the same page show conflicting status

## Dev Commands

```bash
pnpm dev          # Start dev server
pnpm lint         # ESLint check
pnpm typecheck    # TypeScript check
pnpm build        # Production build
pnpm test         # Run tests (if applicable)
```
