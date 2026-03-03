# Testing Road Snapping Implementation

## QUESTION: How can I test what has been implemented?

Based on the `quickstart.md` and the implementation, here's how to test:

## Prerequisites

- Supabase stack running (`infra/supabase/`)
- Next.js dev server

## 1. Apply the Migration

```bash
psql "$DATABASE_URL" -f supabase/migrations/00005_road_snapping.sql
```

## 2. Enable OSRM (optional — tests both paths)

Add to `.env.local`:

```
OSRM_BASE_URL=https://router.project-osrm.org
```

## 3. Test with OSRM Enabled

Send a GPS ping (replace `{vanId}` and token with real values):

```bash
curl -X POST http://localhost:3000/api/tracking/{vanId} \
  -H "Content-Type: application/json" \
  -H "x-ingestion-token: {token}" \
  -d '{"deviceId":"test","lat":-12.9714,"lng":-38.5124,"accuracy":10,"speed":5,"heading":90,"ts":'$(date +%s000)'}'
```

Then verify:

- **DB check:** `SELECT last_lat, last_lng, snapped_lat, snapped_lng FROM vans WHERE id = '{vanId}'` — `snapped_lat`/`snapped_lng` should be populated and slightly different from `last_lat`/`last_lng`
- **API check:** `curl http://localhost:3000/api/routes/{routeId}` — `van.lastLat`/`van.lastLng` should return the snapped values
- **Visual check:** Open the route detail page at close zoom — marker should appear on the road

Send 3-5 pings with slightly different coords to build trajectory context for better matching.

## 4. Test Fallback (OSRM Disabled)

Remove `OSRM_BASE_URL` from `.env.local` (or restart without it), send another ping:

- `snapped_lat`/`snapped_lng` should be NULL in the DB
- API should return `last_lat`/`last_lng` as `lastLat`/`lastLng` (raw GPS)
- Everything works exactly as before the feature

## 5. Test Audit Trail

```sql
SELECT lat, lng FROM van_location_pings WHERE van_id = '{vanId}' ORDER BY device_ts DESC LIMIT 5;
```

These should always be the raw device-reported coordinates, never snapped values.

## What to Look For

| Scenario | Expected |
|---|---|
| OSRM enabled + good GPS | `snapped_lat`/`snapped_lng` populated, marker on road |
| OSRM enabled + no match | `snapped_*` = NULL, falls back to raw GPS |
| OSRM disabled (no env var) | `snapped_*` = NULL, no network request, no errors |
| `van_location_pings` table | Always raw GPS, regardless of OSRM state |
| ETA computation | Uses snapped coords when available (transparent) |
