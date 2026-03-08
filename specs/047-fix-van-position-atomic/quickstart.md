# Quickstart: Atomic Van Position Update

**Feature**: 047-fix-van-position-atomic

## Prerequisites

- Local Supabase stack running (`docker compose up` in `infra/supabase/`)
- OSRM instance (optional, for road-snapping tests)
- Node.js + pnpm installed

## Setup

1. **Apply migration**:
   ```bash
   # From repo root, apply the new migration to local Supabase
   pnpm supabase db push
   ```
   This adds the `last_gps_fix_at` column, backfills it from existing pings, and creates the `update_van_position` RPC function.

2. **Verify migration**:
   ```sql
   -- In Supabase Studio SQL editor:
   SELECT id, name, location_updated_at, last_gps_fix_at FROM vans;
   -- Expect: last_gps_fix_at populated for vans with ping history, NULL for others
   ```

3. **Run dev server**:
   ```bash
   pnpm dev
   ```

## Testing the Fix

### Test 1: GPS device timestamp stored correctly

```bash
# Send a ping with a known device timestamp
curl -X POST http://localhost:3000/api/tracking/<vanId> \
  -H "Authorization: Bearer <ingestion_token>" \
  -H "Content-Type: application/json" \
  -d '{"lat": -12.97, "lng": -38.51, "ts": 1741363200000, "accuracy": 10, "speed": 5, "heading": 90}'
```

Verify in DB: `last_gps_fix_at` matches the device timestamp (not server time).

### Test 2: Position regression prevented

```bash
# Send an older ping (device_ts before current last_gps_fix_at)
curl -X POST http://localhost:3000/api/tracking/<vanId> \
  -H "Authorization: Bearer <ingestion_token>" \
  -H "Content-Type: application/json" \
  -d '{"lat": -13.00, "lng": -38.50, "ts": 1741360000000, "accuracy": 10, "speed": 5, "heading": 90}'
```

Verify: `last_lat`, `last_lng`, and `last_gps_fix_at` remain unchanged (older ping rejected).

### Test 3: Consumer freshness uses GPS device time

```bash
# Query route API and check freshness is based on device timestamp
curl http://localhost:3000/api/routes/<routeId>
```

Verify: The `van.lastGpsFixAt` field in the response matches the device timestamp, and `isLocationOutdated` reflects the device time age (not server receipt age).

## Quality Gates

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm build         # next build
pnpm test          # vitest
```

## Key Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/00009_atomic_van_position.sql` | New column + RPC + backfill |
| `src/app/api/tracking/[vanId]/route.ts` | Replace UPDATE with `supabase.rpc("update_van_position", ...)` |
| `src/app/api/tracking-batch/[vanId]/route.ts` | Same RPC replacement |
| `src/app/api/routes/route.ts` | Read `last_gps_fix_at` for freshness |
| `src/app/api/routes/[routeId]/route.ts` | Read `last_gps_fix_at` for freshness |
| `src/lib/tracking/eta.ts` | `VanPosition.lastGpsFixAt` |
| `src/lib/tracking/tracker-health.ts` | Query `last_gps_fix_at` |
| `src/types/index.ts` | Add `last_gps_fix_at` to `Van` type |
