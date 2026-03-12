# Quickstart: Driver Workflow V1

**Feature**: 068-driver-workflow-v1

## Prerequisites

- Node.js (see `.nvmrc`)
- Supabase local dev running (`docker compose up` in `infra/supabase/`)
- A driver user with `app_metadata.role = "driver"` and `is_active = true`
- At least one route assigned to that driver via `route_drivers`
- At least one van with schedule entries and GPS coordinates on stops

## Key Files to Read First

| Area | File | Why |
|------|------|-----|
| Spec | `specs/068-driver-workflow-v1/spec.md` | Requirements and acceptance scenarios |
| Data model | `specs/068-driver-workflow-v1/data-model.md` | Schema changes, state transitions |
| Contracts | `specs/068-driver-workflow-v1/contracts/` | API request/response shapes |
| Progression core | `src/lib/tracking/enforce-canonical-prefix.ts` | The contiguous-prefix rule (must modify) |
| Progress resolver | `src/lib/tracking/resolve-route-progress.ts` | Assembles RouteProgress (must modify) |
| Types | `src/types/index.ts` | All entity types (must extend) |
| Existing driver page | `src/app/driver/page.tsx` | Current driver dashboard (must link to active route) |
| Existing public detail | `src/app/(public)/routes/[routeId]/page.tsx` | Reference for polling and map patterns |

## Implementation Phases

### Phase A: Active-Route Screen (P1) — No backend changes

1. Create `src/app/driver/routes/[routeId]/page.tsx` — new active-route page
2. Create components in `src/components/driver/active-route/`:
   - `next-stop-hero.tsx` — stop name, scheduled time, ETA, delay badge
   - `tracker-health.tsx` — battery, network, ping age indicators
   - Reuse `ScheduleTimeline` from `src/components/public/schedule-timeline.tsx` for the stop list (collapsible past stops, skipped indicators, ETA)
3. Create `GET /api/driver/routes/[routeId]` — wraps `resolveRouteProgress()` + latest ping query for tracker health
4. Add navigation handoff ("Navegar") button — Google Maps URL with next stop coordinates
5. Use TanStack Query with `refetchInterval: 5000` (same pattern as public route detail)
6. Modify `route-card.tsx` to link to active-route page when shift is running

### Phase B: Schema + Backend Model (P2) — Migration + progression logic

1. Create migration `00020_stop_exceptions.sql`:
   - Extend `route_run_stops.status` CHECK to include `skipped`
   - Add `reason_code`, `note`, `acted_by`, `acted_at` to `route_run_stops`
   - Create `route_run_events` table
   - Add `is_detour_active`, `detour_reason_code`, `detour_note`, `has_skipped_stops` to `route_runs`
2. Update `src/types/index.ts` with extended types
3. Modify `enforceCanonicalPrefix()` — treat `skipped` as resolved
4. Modify `persistCanonicalProgress()` — `next_stop_id` skips over skipped stops
5. Verify `inferStopProgress()` backfill only targets `pending` stops
6. Verify `processDeviceGeofenceEvents()` pending list excludes skipped
7. Modify `resolveRouteProgress()` — include exception data in response
8. Modify `computeEta()` — exclude skipped stops from delay calculation
9. Add Zod schemas: `SkipStopBodySchema`, `DetourBodySchema`
10. Create `POST /api/routes/[routeId]/skip-stop` endpoint
11. Create `POST /api/routes/[routeId]/detour` endpoint
12. Modify `POST /api/routes/[routeId]/end` — auto-deactivate detour on shift end
13. Write unit tests for modified progression logic

### Phase C: Exception Drawer UI (P2 frontend)

1. Create `src/components/driver/active-route/exception-drawer.tsx`
   - "Pular proxima parada" action → reason picker + note field + confirm
   - "Entrar em desvio" / "Sair do desvio" toggle
2. Show skipped stops with "Pulada" badge in stop list
3. Show "Em desvio" indicator when detour active

### Phase D: Public Warning States (P4)

1. Extend `GET /api/routes` response with `hasSkippedStops`, `isDetourActive`
2. Extend `GET /api/routes/[routeId]` response with per-stop `status` (including `skipped`)
3. Add warning badge to public route list for routes with exceptions
4. Add skipped-stop styling to public route detail schedule timeline
5. Add detour banner to public route detail
6. Add ETA caveat note when exceptions exist

## Testing a Skip Action (Manual)

1. Start the dev server: `npm run dev`
2. Log in as a driver at `/admin/login`
3. Go to `/driver` → start a shift on a route
4. Open the active-route screen → tap the exception menu
5. Choose "Pular proxima parada" → select a reason → confirm
6. Verify: next-stop hero advances, skipped stop shows "Pulada" badge
7. Check audit: query `route_run_events` for the `stop_skipped` event
8. View the public route page → verify skipped stop indicator appears

## Reason Code Reference

### Skip Reasons
| Code | Label |
|------|-------|
| `road_closure` | Via interditada |
| `no_passengers` | Sem passageiros |
| `facility_closed` | Local fechado |
| `vehicle_issue` | Problema no veiculo |
| `other` | Outro |

### Detour Reasons
| Code | Label |
|------|-------|
| `road_closure` | Via interditada |
| `accident` | Acidente |
| `construction` | Obra na via |
| `flooding` | Alagamento |
| `police_checkpoint` | Blitz policial |
| `other` | Outro |
