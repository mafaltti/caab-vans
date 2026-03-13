# Route-Based Driver Assignment Refactor

## Summary
Refactor driver assignment so routes, not vans, are the source of truth for staffing. Keep the current 1:1 route-to-van relationship unchanged. Drivers may be assigned to multiple routes, and a route may have multiple assigned drivers, but only one active shift remains allowed per route at a time. Use automatic data migration from current van assignments and cut the app over to route-only authorization in the same release, with no runtime fallback to van assignments.

## Key Changes
### Database and migration
- Add `route_drivers(route_id, driver_id, created_at)` with:
  - PK `(route_id, driver_id)`
  - FK `route_id -> routes(id) ON DELETE CASCADE`
  - index on `driver_id`
  - no FK to `auth.users`, matching the current auth-user pattern
- Backfill `route_drivers` from existing data with `van_drivers JOIN routes ON routes.van_id = van_drivers.van_id`.
- Keep `van_drivers` physically present for this release to avoid destructive deploy sequencing, but remove all application reads/writes immediately. Do not use it as fallback anywhere.
- Do not change `routes.van_id` cardinality, `route_runs`, or `route_shifts`.

### Admin/API behavior
- Make route assignment the only authorization source for starting a route.
- Keep end-shift authorization unchanged: the driver who started the active shift can end it even if route assignment changes later.
- Add `GET /api/admin/drivers` for admin + superuser only, returning active driver options `{ id, email }`.
- Keep `/api/admin/users` superuser-only for account management.
- Change admin route APIs:
  - `GET /api/admin/routes` includes `driverIds: string[]`
  - `POST /api/admin/routes` accepts `driverIds?: string[]`
  - `PUT /api/admin/routes/[routeId]` accepts `driverIds?: string[]`
  - Normalize missing `driverIds` to `[]`, de-duplicate server-side, and validate every ID as an active `driver`
- Change admin van APIs:
  - remove `driverIds` from responses
  - remove `driverIds` from update validation and persistence
- Change driver-facing route discovery to query `route_drivers` directly instead of `van_drivers`.
- Change start-shift authorization to check `route_drivers` for the route, not the van.
- Leave tracker/config and ingestion van-centric.

### Admin UI
- Move driver assignment UI to route create/edit forms as a multi-select or checkbox list sourced from `GET /api/admin/drivers`.
- Remove driver selection from van edit UI entirely.
- Keep current route list layout unchanged unless a small “assigned drivers” indicator is trivial; it is not required for this refactor.
- Keep current route edit loading pattern and extend the existing route list payload with `driverIds` rather than adding a new route-detail GET endpoint.

### Validation and edge behavior
- Creating a route with no assigned drivers is allowed.
- Updating a route replaces the entire assigned-driver set for that route.
- Deleting a route removes its `route_drivers` rows via cascade.
- A driver assigned to a route can start that route even though vans no longer store driver assignments.
- Only one active shift per route/run remains allowed; preserve the existing conflict behavior.

## Test Plan
- Migration test: backfill one route with multiple van-assigned drivers and verify matching `route_drivers` rows are created.
- Migration edge test: vans with driver assignments but no route do not create orphaned rows.
- Admin permission tests:
  - admin and superuser can fetch driver options
  - regular drivers cannot
  - `/api/admin/users` remains superuser-only
- Admin route API tests:
  - create/update route with `driverIds`
  - reject inactive or non-driver users
  - omit `driverIds` and get `[]`
  - duplicate IDs collapse to one assignment
- Driver flow tests:
  - `/api/driver/routes` returns routes from `route_drivers`
  - assigned driver can start route
  - unassigned driver gets 403
  - concurrent second active shift still gets conflict
  - active shift owner can still end after assignment removal
- Regression tests:
  - van admin pages still work without driver fields
  - tracker-config/tracking behavior is unchanged

## Assumptions and defaults
- Route assignment is the sole source of truth for who may start a route.
- The route↔van relationship stays 1:1 in this refactor.
- Admins and superusers may assign drivers to routes.
- No runtime compatibility fallback to `van_drivers` is allowed after cutover.
- `van_drivers` cleanup/drop is a later follow-up after deploy verification, not part of this change.
