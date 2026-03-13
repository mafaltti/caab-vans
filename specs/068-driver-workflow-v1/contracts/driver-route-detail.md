# Contract: GET /api/driver/routes/[routeId]

**Type**: New endpoint
**Auth**: Requires `role = "driver"` + route assignment via `route_drivers`

## Purpose

Returns full route detail with progress, schedule, van position, ETA, and tracker health for the active-route driver screen. Wraps existing `resolveRouteProgress()` and adds tracker health data.

## Request

```
GET /api/driver/routes/{routeId}
Authorization: Bearer <session cookie>
```

No query parameters.

## Response (200 OK)

```typescript
{
  route: {
    id: string;
    name: string;
    isRunning: boolean;
    trackingStatus: "live" | "stale" | "missing";
    isTrackingFresh: boolean;
    scheduleStatus: "active" | "ended" | "not_started";
    totalStops: number;
    currentStopIndex: number | null;

    // Progress (from resolveRouteProgress)
    progress: {
      serviceDate: string;
      runStatus: "waiting" | "in_progress" | "idle" | "completed";
      shiftStartedAt: string | null;
      nextStopId: string | null;
      passedStopIds: string[];
      skippedStopIds: string[];           // NEW
      etaNextStopISO: string | null;
      etaNextStopMinutes: number | null;
      delayMinutes: number | null;
      etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null;
      etaStatus: "estimated" | "overdue" | "none";
      // Exception state
      hasSkippedStops: boolean;           // NEW
      isDetourActive: boolean;            // NEW
      detourReasonCode: string | null;    // NEW
      detourNote: string | null;          // NEW
    } | null;

    // Full schedule with per-stop status
    schedule: Array<{
      id: string;
      stopName: string;
      arrivalTime: string;      // HH:mm
      departureTime: string;    // HH:mm
      stopSequence: number;
      stopLat: number | null;
      stopLng: number | null;
      // Per-stop status
      status: "pending" | "passed" | "skipped" | null;  // null if no run exists
      passedAt: string | null;
      reasonCode: string | null;    // for skipped stops
      note: string | null;          // for skipped stops
    }>;

    // Van position
    van: {
      id: string;
      lastLat: number | null;
      lastLng: number | null;
      lastGpsFixAt: string | null;
      isLocationOutdated: boolean;
    };

    // Tracker health (NEW — driver-only)
    trackerHealth: {
      lastPingAt: string | null;          // ISO timestamp of latest ping
      minutesSinceLastPing: number | null;
      batteryLevel: number | null;        // 0.0–1.0
      networkType: string | null;         // e.g., "wifi", "cellular"
      bufferSize: number | null;
      failureCount: number | null;
      isStale: boolean;                   // true if > 5 min since last ping
      isLowBattery: boolean;              // true if battery < 0.20
    } | null;
  };
  serverTime: string; // HH:mm
}
```

## Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 401 | UNAUTHORIZED | Not authenticated |
| 403 | FORBIDDEN | Not driver role or not assigned to this route |
| 404 | NOT_FOUND | Route does not exist |
