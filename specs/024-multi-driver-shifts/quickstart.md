# Quickstart: Multi-Driver Shift Support

## Prerequisites

- Local Supabase stack running (`docker compose up` in `infra/supabase/`)
- Next.js dev server running (`npm run dev`)
- At least two users with `role: "driver"` created via admin UI
- A van with a route and schedule entries

## Setup Steps

1. **Run migration**: Apply `supabase/migrations/00004_multi_driver_shifts.sql` to local database.
2. **Assign drivers to van**: Use admin UI → Vans → Edit → assign both test drivers.
3. **Test shift lifecycle**:
   - Log in as Driver A → tap "Start Shift" → verify route shows as in_progress.
   - On the public portal, verify live tracking appears.
   - As Driver A → tap "End Shift" → verify route shows as idle (schedule-only on portal).
   - Log in as Driver B → tap "Start Shift" → verify new shift starts.
   - On the public portal, verify live tracking resumes.
   - As Driver B → tap "End Shift" → verify both shifts appear in history.

## Key Files to Change

### Database
- `supabase/migrations/00004_multi_driver_shifts.sql` — new tables, data migration, column drops

### Types
- `src/types/index.ts` — remove `driver_id` from `Van`, remove `started_at`/`ended_at` from `RouteRun`, add `RouteShift`, `VanDriver`, update `RunStatus`, `DriverRoute`, `RouteProgress`

### BFF (API Routes)
- `src/app/api/routes/[routeId]/start/route.ts` — create shift instead of updating run
- `src/app/api/routes/[routeId]/end/route.ts` — end shift instead of updating run
- `src/app/api/driver/routes/route.ts` — query `van_drivers`, include shifts
- `src/app/api/routes/[routeId]/route.ts` — derive status from shifts
- `src/app/api/routes/route.ts` — derive status from shifts
- `src/app/api/admin/vans/[vanId]/route.ts` — handle `driverIds` array
- `src/app/api/admin/vans/route.ts` — return `driverIds` array

### Shared Libraries
- `src/lib/tracking/run-status.ts` — rewrite `deriveRunStatus` to use shifts
- `src/lib/tracking/eta.ts` — pass `startedAt` from shift instead of run

### UI Components
- `src/components/driver/route-card.tsx` — shift-aware start/end buttons, shift history
- `src/components/admin/van-form.tsx` — multi-driver selection
- `src/components/public/hero-card.tsx` — handle `idle` status (null progress)
- `src/components/public/route-status-badge.tsx` — handle `idle` status

## Verification Checklist

- [ ] Migration runs without errors
- [ ] Existing data migrated correctly (check `van_drivers` and `route_shifts` tables)
- [ ] `vans.driver_id`, `route_runs.started_at`, `route_runs.ended_at` columns are gone
- [ ] Driver A can start and end a shift
- [ ] Driver B can start a new shift after Driver A ends
- [ ] Public portal shows schedule-only between shifts
- [ ] Public portal shows "ended for today" only after schedule window passes
- [ ] Admin can assign multiple drivers to a van
- [ ] ETA computation works correctly with shift-based `startedAt`
- [ ] `lint`, `tsc --noEmit`, `next build` pass
