# Contract: Route Progress API

## Endpoints Affected

### GET /api/routes

**New query parameter**: `includeLastKnown` (optional, boolean, default `false`)

When `true`, non-active runs (completed, idle, waiting) return their last known progress instead of null/empty.

**Response shape**: No structural changes. The `progress` field in each route object may now contain non-null values for non-active runs when the parameter is set.

### GET /api/routes/[routeId]

Same `includeLastKnown` query parameter behavior as above.

## RouteProgress Type (No Breaking Changes)

```typescript
interface RouteProgress {
  serviceDate: string;
  runStatus: RunStatus;
  shiftStartedAt: string | null;
  nextStopId: string | null;        // Now non-null for late routes (was null when all stops overdue)
  passedStopIds: string[];           // Now non-empty for non-active runs with includeLastKnown
  etaNextStopISO: string | null;     // Now non-null for late routes
  etaNextStopMinutes: number | null; // Now non-null for late routes
  delayMinutes: number | null;
  etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null;
}
```

## Behavioral Changes (Non-Breaking)

| Scenario | Before | After |
|----------|--------|-------|
| All stops overdue, pointer stale | `nextStopId: null`, `etaNextStopMinutes: null` | Valid nextStopId + ETA (pointer target or route-order fallback) |
| Pointer targets non-successor stop, GPS stale | ETA based on single-segment distance (often clamped to 0) | ETA based on cumulative segment distance or schedule fallback |
| Default progress source (no env var) | Legacy time-floor algorithm | Persisted pointer algorithm |
| Non-active run + `includeLastKnown=true` | N/A (parameter didn't exist) | Returns last known progress data |

## Backward Compatibility

- No response fields added or removed.
- Clients that don't send `includeLastKnown` see identical behavior for non-active runs.
- Clients may see non-null ETA values in scenarios where they previously received null (improvement, not breakage).
- `TRACKING_PROGRESS_SOURCE=legacy` restores previous default behavior if needed.
