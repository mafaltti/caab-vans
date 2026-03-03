# Implementation Summary: Road Snapping for Van GPS Positions

## Files Created (4)

| File | Purpose |
|---|---|
| `supabase/migrations/00005_road_snapping.sql` | Adds `snapped_lat`/`snapped_lng` columns to `vans` table |
| `src/lib/tracking/osrm.ts` | OSRM match client — `snapToRoad()` with 50ms timeout, null-on-failure fallback |
| `infra/osrm/docker-compose.yml` | OSRM Docker stack (port 5000, healthcheck, MLD algorithm) |
| `infra/osrm/scripts/update-data.sh` | Monthly Geofabrik Nordeste data refresh script |

## Files Modified (4)

| File | Changes |
|---|---|
| `.env.local.example` | Added `OSRM_BASE_URL` with dev/prod comments |
| `src/types/index.ts` | Added `snapped_lat`/`snapped_lng` to `Van` type |
| `src/app/api/tracking/[vanId]/route.ts` | Queries last 4 pings, calls OSRM, writes snapped coords to `vans`. Raw GPS preserved in pings + geofence detection |
| `src/app/api/routes/[routeId]/route.ts` + `route.ts` (list) | Serves `snapped_lat ?? last_lat` for map markers, ETA, and API responses |

## Quality Gates

- **TypeScript:** Zero new errors (pre-existing van-tracker Expo errors unrelated)
- **ESLint:** Zero errors
- **Build:** Pre-existing failure in `apps/van-tracker/` only (not our code)

## Architecture Verification (US2-US4)

- **US2 (ETA):** `VanPosition` automatically uses snapped coords via nullish coalescing
- **US3 (Graceful degradation):** OSRM skipped when `OSRM_BASE_URL` unset; `snapped_*` = NULL, fallback to raw GPS
- **US4 (Audit trail):** `van_location_pings` INSERT untouched — raw GPS preserved

## Extra: Also Updated `/api/routes` (List Endpoint)

The routes list API also serves van positions and constructs `VanPosition` for ETA. Updated it with the same snapped-with-fallback pattern for consistency.
