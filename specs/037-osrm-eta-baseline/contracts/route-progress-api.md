# API Contract: Route Progress (ETA Changes)

**Feature**: 037-osrm-eta-baseline
**Endpoints affected**: `GET /api/routes`, `GET /api/routes/{routeId}`

## Change Summary

The `progress.etaSource` field gains a new value `"gps_osrm"`. No fields are added or removed. All other response fields remain unchanged.

## etaSource Field

**Before**:
```typescript
etaSource: "gps" | "schedule" | null
```

**After**:
```typescript
etaSource: "gps" | "gps_osrm" | "schedule" | null
```

### Value Semantics

| Value | Meaning | Distance Source | Speed Source | Correction Factor |
|-------|---------|-----------------|-------------|-------------------|
| `"gps_osrm"` | **New.** Road distance from routing engine + GPS speed + time factor | OSRM `/route` | GPS `last_speed_mps` | Applied |
| `"gps"` | Haversine fallback + GPS speed + time factor | Haversine × 1.3 | GPS `last_speed_mps` | Applied |
| `"schedule"` | Schedule-based (no GPS or van stopped) | N/A | N/A | Not applied |
| `null` | No ETA available (no pending stops) | N/A | N/A | N/A |

## Backward Compatibility

- **Additive change only**: existing values `"gps"`, `"schedule"`, `null` retain their meaning.
- Clients that don't check for `"gps_osrm"` will simply not distinguish it from `"gps"`. No breakage.
- ETA numeric fields (`etaNextStopISO`, `etaNextStopMinutes`, `delayMinutes`) keep the same types and semantics — only their accuracy improves.

## Example Response (progress object)

```json
{
  "serviceDate": "2026-03-04",
  "runStatus": "in_progress",
  "shiftStartedAt": "2026-03-04T06:30:00-03:00",
  "nextStopId": "abc-123",
  "passedStopIds": ["def-456", "ghi-789"],
  "etaNextStopISO": "2026-03-04T07:15:00-03:00",
  "etaNextStopMinutes": 8,
  "delayMinutes": 3,
  "etaSource": "gps_osrm"
}
```
