# GPS-Distance-Based ETA

## Context

ETA currently uses a schedule-delay approach: it measures how late/early the van was at the last geofenced stop and shifts the next stop's scheduled time by that delay. Between stops, the ETA never updates — even if the van is stuck in traffic.

This change makes ETA use the van's real GPS position and speed to estimate arrival at the next stop. When GPS data is unavailable or unreliable, it falls back to the current schedule-based logic.

**Formula:** `ETA_minutes = (haversine_distance × 1.3 road factor) / speed / 60`

## Files to Modify

| File | Change |
|---|---|
| `src/lib/tracking/eta.ts` | Add GPS branch to `computeEta()` with fallback |
| `src/types/index.ts` | Add `etaSource` to `RouteProgress` |
| `src/app/api/routes/[routeId]/route.ts` | Fetch `last_speed_mps` + stop coords, pass `vanPosition` to `computeEta()` |
| `src/app/api/routes/route.ts` | Same wiring as above |
| `src/__tests__/tracking/eta.test.ts` | Add GPS ETA test cases |

## Implementation

### 1. `src/lib/tracking/eta.ts` — Core Logic

**Extend interfaces:**

- `Stop`: add optional `stopLat?: number | null`, `stopLng?: number | null`
- `EtaResult`: add `etaSource: "gps" | "schedule" | null`
- New `VanPosition`: `{ lat, lng, speedMps, locationUpdatedAt: DateTime }`
- `computeEta` args: add optional `vanPosition?: VanPosition | null`

**Constants:**

- `ROAD_FACTOR = 1.3` (straight-line to road distance approximation)
- `MIN_SPEED_MPS = 1.0` (~3.6 km/h; below = van effectively stopped)
- `STALENESS_MINUTES = 10`

**Logic** (after finding `nextStop`, before computing `etaDateTime`):

```
canUseGps = vanPosition exists
  AND nextStop has lat/lng
  AND speed >= MIN_SPEED_MPS
  AND location age < STALENESS_MINUTES

if (canUseGps):
  distance = haversineDistanceMeters(van → next stop)
  travelMinutes = (distance × ROAD_FACTOR) / speed / 60
  etaDateTime = now + travelMinutes
  etaSource = "gps"
else:
  existing schedule-delay logic (unchanged)
  etaSource = "schedule"
```

### 2. `src/types/index.ts`

Add to `RouteProgress`:

```ts
etaSource: "gps" | "schedule" | null;
```

### 3. `src/app/api/routes/[routeId]/route.ts`

- Add `last_speed_mps` to the van SELECT (line 37)
- Add `stop_lat`, `stop_lng` to the `route_run_stops` join on `schedule_entries` (line 125)
- Build `vanPosition` object from van data
- Pass `vanPosition` and stop coordinates to `computeEta()`

### 4. `src/app/api/routes/route.ts`

Same three changes as the route detail API.

### 5. Tests (`src/__tests__/tracking/eta.test.ts`)

New `describe("GPS-based ETA")` block:

1. Uses GPS when van is moving + fresh location + stop has coords → `etaSource: "gps"`
2. Falls back when speed = 0 → `etaSource: "schedule"`
3. Falls back when speed < threshold → `etaSource: "schedule"`
4. Falls back when location stale (>10 min) → `etaSource: "schedule"`
5. Falls back when stop has no coords → `etaSource: "schedule"`
6. Falls back when `vanPosition` is null → `etaSource: "schedule"`
7. Returns ~0 min when van is at the stop
8. Existing tests pass unchanged (`vanPosition` not provided → schedule path)

## Fallback Summary

GPS ETA is used only when **all** conditions are met: van has fresh coordinates (< 10 min), speed >= 1 m/s, and the next stop has lat/lng. Otherwise → schedule-based ETA as today.

## What Does NOT Change

- `haversine.ts` — already exists
- Frontend components — no changes (same `etaNextStopMinutes` field)
- Database schema — all columns already exist
- GPS ingestion (`/api/tracking/[vanId]`) — unchanged
- Geofence stop detection — unchanged

## Verification

1. `npx vitest run` — all existing + new tests pass
2. `npx tsc --noEmit` — no type errors
3. `npx next build` — builds clean
4. Manual: with tracking simulator running, verify ETA updates between stops (not just at geofences)
