# Data Model: Fix Map Staleness

No database schema changes required. This feature modifies client-side filtering constants and frontend UI only.

## Existing Entities (Read-Only Context)

### van_location_pings (unchanged)

GPS pings from tracker. Fields: `van_id`, `lat`, `lng`, `accuracy`, `speed_mps`, `heading_deg`, `device_ts`, `received_at`.

### vans (unchanged)

Van state. Relevant fields: `last_lat`, `last_lng`, `last_gps_fix_at`, `location_updated_at`.

## API Response Shape (unchanged)

`GET /api/routes/[routeId]` returns `RouteWithStatus.van`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Van ID |
| `lastGpsFixAt` | string \| null | ISO timestamp — **already exposed, will be used for "last updated" display** |
| `isLocationOutdated` | boolean | Computed server-side using `isLocationFresh()` — **threshold changing from 10 → 3 min** |
| `lastLat` | number \| null | Latitude (snapped if available) |
| `lastLng` | number \| null | Longitude (snapped if available) |

## Constants Changed

| Constant | File | Old Value | New Value |
|----------|------|-----------|-----------|
| `STATIONARY_MAX_INTERVAL` | `apps/van-tracker/src/location/task.ts:49` | `60_000` | `20_000` |
| `STALENESS_THRESHOLD_MINUTES` | `src/lib/time.ts:13` | `10` | `3` |
