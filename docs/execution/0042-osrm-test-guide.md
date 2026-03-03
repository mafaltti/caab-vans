# OSRM Road Snapping — Test Guide

**Date**: 2026-03-03
**Feature**: 033-road-snapping
**Branch**: `033-road-snapping`

## Prerequisites

- Supabase stack running (`infra/supabase/`)
- Next.js dev server running (`npm run dev`)
- Migration applied: `00005_road_snapping.sql`
- OSRM running (self-hosted on port 5000 or public demo)

## Environment Setup

### Option A: Self-hosted OSRM (recommended)

```bash
cd infra/osrm
./scripts/update-data.sh   # First time only (~15-30 min)
docker compose up -d
```

Add to `.env.local`:

```bash
OSRM_BASE_URL=http://localhost:5000
```

### Option B: Public demo (dev only)

Add to `.env.local`:

```bash
OSRM_BASE_URL=https://router.project-osrm.org
```

> **Note**: 1 req/sec rate limit. Sufficient for manual testing, not for production.

### Apply Migration

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "ALTER TABLE vans ADD COLUMN snapped_lat double precision, ADD COLUMN snapped_lng double precision;"
```

Verify:

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vans' AND column_name LIKE 'snapped%';"
```

Expected:

```
 column_name |    data_type
-------------+------------------
 snapped_lat | double precision
 snapped_lng | double precision
```

## Test Variables

Get a van ID and token from the database:

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "SELECT id, name, ingestion_token FROM vans LIMIT 4;"
```

Set shell variables (replace with actual values):

```bash
VAN_ID="<van-uuid>"
TOKEN="<ingestion-token>"
DEV="a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"  # any valid UUID v4
URL="http://localhost:3000/api/tracking/$VAN_ID"
```

## Tests

### Test 1: OSRM Health Check

```bash
curl -s "http://localhost:5000/match/v1/driving/-38.436,-12.943;-38.4362,-12.9435?timestamps=1000;1015"
```

Expected: JSON response with `"code":"Ok"` or `"code":"NoMatch"`. Any response means OSRM is alive.

### Test 2: Send GPS Pings (OSRM Enabled)

Send 5 pings along a Salvador road (~15s apart):

```bash
NOW=$(date +%s)

curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9430,\"lng\":-38.4360,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( (NOW-60)*1000 ))}"

curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9435,\"lng\":-38.4362,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( (NOW-45)*1000 ))}"

curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9440,\"lng\":-38.4364,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( (NOW-30)*1000 ))}"

curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9445,\"lng\":-38.4366,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( (NOW-15)*1000 ))}"

curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9450,\"lng\":-38.4368,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( NOW*1000 ))}"
```

Expected: All return `{"received":true,"ts":...}`.

### Test 3: Verify Snapped Coordinates in DB

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "SELECT last_lat, last_lng, snapped_lat, snapped_lng FROM vans WHERE id = '$VAN_ID';"
```

Expected: `snapped_lat` and `snapped_lng` are populated and slightly different from `last_lat`/`last_lng` (typically 2-15m offset onto the nearest road).

### Test 4: Verify Snap Distance

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres -c \
  "SELECT
     last_lat AS raw_lat, last_lng AS raw_lng,
     snapped_lat, snapped_lng,
     round(cast(abs(snapped_lat - last_lat) * 111320 as numeric), 1) AS lat_diff_m,
     round(cast(abs(snapped_lng - last_lng) * 111320 * cos(radians(last_lat)) as numeric), 1) AS lng_diff_m
   FROM vans WHERE id = '$VAN_ID';"
```

Expected: `lat_diff_m` and `lng_diff_m` should be small (< 50m). Values of 2-15m are typical for GPS correction onto a road.

### Test 5: Verify API Serves Snapped Coordinates

Get the route ID for your van:

```bash
ROUTE_ID=$(docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres -t \
  -c "SELECT id FROM routes WHERE van_id = '$VAN_ID';" | tr -d ' \n')
```

Check route detail API:

```bash
curl -s "http://localhost:3000/api/routes/$ROUTE_ID" | grep -o '"lastLat":[^,]*,"lastLng":[^,}]*'
```

Expected: `lastLat` and `lastLng` should match `snapped_lat`/`snapped_lng` from the DB (not the raw values).

Check routes list API:

```bash
curl -s "http://localhost:3000/api/routes" | grep -o '"lastLat":[^,]*,"lastLng":[^,}]*'
```

Expected: Same snapped values for your van.

### Test 6: Verify Audit Trail (Raw GPS Preserved)

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "SELECT lat, lng, device_ts FROM van_location_pings WHERE van_id = '$VAN_ID' ORDER BY device_ts DESC LIMIT 5;"
```

Expected: The `lat`/`lng` values must be the exact raw coordinates you sent in the pings (`-12.9430`, `-12.9435`, etc.), never the snapped values. The `van_location_pings` table is an immutable audit trail.

### Test 7: Graceful Degradation (OSRM Down)

Stop OSRM:

```bash
docker stop osrm-osrm-1
```

Send a ping:

```bash
NOW=$(date +%s)
curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9455,\"lng\":-38.4370,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( NOW*1000 ))}"
```

Expected: `{"received":true,"ts":...}` — no error.

Check DB:

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "SELECT last_lat, last_lng, snapped_lat, snapped_lng FROM vans WHERE id = '$VAN_ID';"
```

Expected: `last_lat`/`last_lng` updated to new values. `snapped_lat`/`snapped_lng` are NULL.

Verify API fallback:

```bash
curl -s "http://localhost:3000/api/routes/$ROUTE_ID" | grep -o '"lastLat":[^,]*,"lastLng":[^,}]*'
```

Expected: `lastLat=-12.9455`, `lastLng=-38.437` (raw GPS, since snapped is NULL).

Restart OSRM:

```bash
docker start osrm-osrm-1
```

### Test 8: Recovery (OSRM Back Up)

Wait for OSRM to be healthy:

```bash
curl -s "http://localhost:5000/match/v1/driving/-38.436,-12.943;-38.4362,-12.9435?timestamps=1000;1015"
```

Send another ping:

```bash
NOW=$(date +%s)
curl -s -X POST "$URL" -H "Content-Type: application/json" -H "x-ingestion-token: $TOKEN" \
  -d "{\"deviceId\":\"$DEV\",\"lat\":-12.9460,\"lng\":-38.4372,\"accuracy\":10,\"speed\":8,\"heading\":180,\"ts\":$(( NOW*1000 ))}"
```

Check DB:

```bash
docker exec -e PGPASSWORD=postgres supabase-db-1 psql -U supabase_admin -d postgres \
  -c "SELECT last_lat, last_lng, snapped_lat, snapped_lng FROM vans WHERE id = '$VAN_ID';"
```

Expected: `snapped_lat`/`snapped_lng` are populated again. Snapping automatically resumed.

### Test 9: OSRM Disabled (No Env Var)

Remove `OSRM_BASE_URL` from `.env.local` and restart the dev server. Send a ping.

Expected:
- Ping accepted normally
- `snapped_lat`/`snapped_lng` are NULL in DB
- API serves raw GPS as `lastLat`/`lastLng`
- No OSRM network requests made (check server logs — no `[osrm]` warnings)
- System behaves identically to before this feature

### Test 10: Visual Check (Map)

1. Ensure OSRM is enabled and pings have been sent
2. Open the route detail page for your van in the browser
3. Zoom in close on the van marker
4. The marker should appear on the road surface, not on a building or sidewalk

## Expected Test Results Summary

| Test | What | Pass Criteria |
|------|------|---------------|
| 1 | OSRM health | Returns JSON response |
| 2 | Send pings | All return `{"received":true}` |
| 3 | DB snapped coords | `snapped_lat`/`snapped_lng` populated |
| 4 | Snap distance | 2-15m offset (< 50m) |
| 5 | API response | `lastLat`/`lastLng` = snapped values |
| 6 | Audit trail | `van_location_pings` has raw GPS only |
| 7 | OSRM down | Ping works, snapped = NULL, API falls back to raw |
| 8 | OSRM recovery | Snapping resumes automatically |
| 9 | No env var | No OSRM calls, raw GPS everywhere |
| 10 | Visual | Marker on road at close zoom |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `snapped_lat` always NULL | Check `OSRM_BASE_URL` is set and OSRM is reachable from Next.js |
| OSRM returns `NoMatch` | Points may be too far from roads — use coords along a known Salvador street |
| 429 from public demo | Rate limited — wait 1s between pings or switch to self-hosted |
| `column snapped_lat does not exist` | Migration not applied — run the ALTER TABLE command |
| Van marker still off-road | Send 3-5 pings to build trajectory context for better matching |
| `deviceId` validation error | Must be a valid UUID v4 format (e.g., `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`) |
