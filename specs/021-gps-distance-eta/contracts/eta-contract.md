# Contract: ETA Computation & API Response

**Feature**: 021-gps-distance-eta | **Date**: 2026-03-02

## 1. computeEta() Interface

### Input

```typescript
computeEta(args: {
  stops: Stop[];
  now: DateTime;
  vanPosition?: VanPosition | null;
}): EtaResult
```

### Stop (extended)

```typescript
interface Stop {
  scheduleEntryId: string;
  time: string;           // "HH:mm"
  status: "pending" | "passed";
  passedAt: string | null; // ISO timestamp
  stopLat?: number | null; // NEW
  stopLng?: number | null; // NEW
}
```

### VanPosition (new)

```typescript
interface VanPosition {
  lat: number;
  lng: number;
  speedMps: number;
  locationUpdatedAt: DateTime;
}
```

### EtaResult (extended)

```typescript
interface EtaResult {
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  nextStopId: string | null;
  passedStopIds: string[];
  etaSource: "gps" | "schedule" | null; // NEW
}
```

### Behavior Contract

| Condition | etaSource | ETA computation |
|-----------|-----------|-----------------|
| `vanPosition` provided, speed >= 1.0 m/s, position < 10 min old, next stop has lat/lng | `"gps"` | `now + (haversine × 1.3) / speed` |
| Any GPS condition not met | `"schedule"` | Existing schedule-delay logic |
| No next stop found | `null` | All ETA fields null |

## 2. API Response Change

### RouteProgress object (in both `/api/routes` and `/api/routes/[routeId]`)

```typescript
// Before
{
  serviceDate: string;
  nextStopId: string | null;
  passedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
}

// After (additive)
{
  serviceDate: string;
  nextStopId: string | null;
  passedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  etaSource: "gps" | "schedule" | null; // NEW
}
```

### Backward Compatibility

- When `vanPosition` is not provided (or null), the function produces identical output to the current implementation plus `etaSource: "schedule"` (or `null` when no next stop).
- Existing API consumers are unaffected — `etaSource` is a new additive field.
- The `delayMinutes` field is only meaningful when `etaSource` is `"schedule"`. When `etaSource` is `"gps"`, `delayMinutes` still reflects the schedule delay (from last passed stop) for informational purposes.
