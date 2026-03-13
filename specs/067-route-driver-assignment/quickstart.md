# Quickstart: Route-Based Driver Assignment

## Prerequisites

- Local Supabase running (`docker compose up` in `infra/supabase/`)
- Node.js and npm available
- `npm install` completed
- At least one van, one route, and one driver user in the database

## Migration

Apply the new migration:

```bash
# Copy to Supabase migrations volume and run
cp supabase/migrations/00018_route_drivers.sql infra/supabase/volumes/db/migrations/
# Then restart or re-init Supabase to apply
```

Verify migration:

```sql
-- Check table exists
SELECT * FROM route_drivers LIMIT 5;

-- Verify backfill matches van_drivers via routes
SELECT count(*) FROM route_drivers;
SELECT count(*) FROM van_drivers vd JOIN routes r ON r.van_id = vd.van_id;
-- Both counts should match
```

## Key Files to Modify

### New files
| File | Purpose |
|------|---------|
| `supabase/migrations/00018_route_drivers.sql` | Table + backfill migration |
| `src/app/api/admin/drivers/route.ts` | GET /api/admin/drivers endpoint |

### Modified files (in suggested implementation order)

| # | File | Change |
|---|------|--------|
| 1 | `src/types/index.ts` | Add `RouteDriver` type |
| 2 | `src/lib/validators/route.ts` | Add `driverIds` to create/update schemas |
| 3 | `src/app/api/admin/routes/route.ts` | GET: join route_drivers; POST: accept + persist driverIds |
| 4 | `src/app/api/admin/routes/[routeId]/route.ts` | PUT: accept + full-replace driverIds |
| 5 | `src/app/api/admin/vans/route.ts` | GET: remove van_drivers query and driverIds |
| 6 | `src/app/api/admin/vans/[vanId]/route.ts` | PUT: remove driverIds handling |
| 7 | `src/app/api/driver/routes/route.ts` | Query route_drivers instead of van_drivers |
| 8 | `src/app/api/routes/[routeId]/start/route.ts` | Check route_drivers instead of van_drivers |
| 9 | `src/components/admin/route-form.tsx` | Add driver multi-select (fetch from /api/admin/drivers) |
| 10 | `src/components/admin/van-form.tsx` | Remove showDriverSelect and driver UI |
| 11 | `src/app/admin/vans/[vanId]/page.tsx` | Remove showDriverSelect/driverIds props |
| 12 | `src/app/admin/routes/new/page.tsx` | Pass driverIds to RouteForm |
| 13 | `src/app/admin/routes/[routeId]/page.tsx` | Pass driverIds to RouteForm |

## Smoke Test Checklist

1. **Migration**: Run migration, verify `route_drivers` rows match expected backfill count.
2. **Admin drivers list**: `GET /api/admin/drivers` returns active drivers as admin (200), rejected as driver (403).
3. **Route create with drivers**: `POST /api/admin/routes` with `driverIds` → route created, `GET` shows driverIds.
4. **Route update drivers**: `PUT /api/admin/routes/{id}` with different `driverIds` → full replacement.
5. **Van edit no drivers**: Open van edit page — no driver checkboxes visible.
6. **Driver dashboard**: Login as assigned driver → route appears. Login as unassigned → route absent.
7. **Start shift**: Assigned driver starts shift → success. Unassigned driver → 403.
8. **End shift after unassignment**: Remove driver from route while shift is active → driver can still end shift.
9. **Build**: `npm run build` passes with no errors.
10. **Type check**: `npx tsc --noEmit` passes.
