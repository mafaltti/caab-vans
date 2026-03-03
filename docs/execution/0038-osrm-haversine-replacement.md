# OSRM as Haversine Replacement

## QUESTION: One question, today we are using haversine. By implementing OSRM for this we could also use it for other parts of the system where we use haversine?

Yes — OSRM would directly improve two core haversine use cases in the system:

## Where Haversine Is Used Today

1. **ETA computation** (`src/lib/tracking/eta.ts:81-88`) — Calculates straight-line distance from van to next stop, then multiplies by a hardcoded `ROAD_FACTOR = 1.3` to approximate road distance. This is the biggest accuracy problem — a 1.3x multiplier is a rough guess that breaks in hilly terrain, winding roads, or when the next stop requires a detour.
2. **Geofence detection** (`src/lib/tracking/infer-stop-progress.ts:151-157`) — Checks if the van is within `geofence_radius_m` of a stop using straight-line distance. This one works well enough since geofences are small (50m default), and at that scale haversine ≈ road distance.

## What OSRM Would Replace/Improve

| Use case | Current | With OSRM | Impact |
|---|---|---|---|
| ETA | haversine × 1.3 | OSRM `/route` → actual road distance + travel time | **High** — eliminates the guessed road factor, handles detours correctly |
| Geofence | haversine < 50m | No change needed | None — haversine is perfectly accurate at 50m scale |
| Road snapping | N/A | OSRM `/match` → snap to nearest road | New capability (what we analyzed) |

## The Key Win

OSRM's `/route` endpoint returns both road distance in meters and estimated travel time in seconds between two coordinates. So for ETA you could replace:

```typescript
// Current: guessed
const travelMinutes = (distanceMeters * ROAD_FACTOR) / vanPosition.speedMps / 60;
```

With:

```typescript
// OSRM: actual road-based travel time
const { duration } = await osrmRoute(vanLat, vanLng, stopLat, stopLng);
const travelMinutes = duration / 60;
```

This gives you real road routing (turn-by-turn aware) instead of a straight-line approximation. For CAAB's routes in Salvador/Bahia — which likely have winding roads, one-way streets, and varied terrain — this would be a significant accuracy improvement.

## Bottom Line

If you deploy OSRM for road snapping, you get ETA improvement essentially for free since the infrastructure is the same. The geofence check can stay as haversine — it's fine at that scale. So one OSRM deployment covers both road snapping (new) and better ETA (replacing the `ROAD_FACTOR` hack).
