# API Contract: GET /api/routes/[routeId]

**Feature**: 019-fix-eta-next-stop

## No Contract Changes

The API response shape is unchanged. The existing `serverTime` field (already present) and `progress` object retain their structure.

## Behavioral Changes

The `progress` object within the response will now return different values for the same input conditions:

### Before Fix

```json
{
  "route": {
    "progress": {
      "nextStopId": "uuid-of-caab-0000",
      "etaNextStopMinutes": 0,
      "etaNextStopISO": "2026-03-01T00:00:00-03:00",
      "passedStopIds": ["uuid-of-stop-2200", "uuid-of-stop-2220"],
      "delayMinutes": null
    }
  },
  "serverTime": "22:35"
}
```

### After Fix

```json
{
  "route": {
    "progress": {
      "nextStopId": "uuid-of-mundo-plaza-2240",
      "etaNextStopMinutes": 5,
      "etaNextStopISO": "2026-03-01T22:40:00-03:00",
      "passedStopIds": ["uuid-of-stop-2200", "uuid-of-stop-2220"],
      "delayMinutes": null
    }
  },
  "serverTime": "22:35"
}
```

### Key Differences

| Field | Before | After |
|-------|--------|-------|
| `nextStopId` | First pending stop by time (00:00) | First pending stop with time >= now (22:35), i.e. 22:40 |
| `etaNextStopMinutes` | 0 (clamped from negative) | 5 (realistic future value) |
| `etaNextStopISO` | Past timestamp | Future timestamp |

## Client Impact

- The `ScheduleTimeline` component will additionally receive `serverTime` as a prop (already available in the query response).
- No changes needed for any other API consumer. The contract is backwards-compatible — the fields are the same, only the values become correct.
