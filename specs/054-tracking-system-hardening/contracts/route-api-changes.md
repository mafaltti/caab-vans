# Contract: Route API Response Changes

**Date**: 2026-03-08
**Endpoints affected**: `GET /api/routes`, `GET /api/routes/[routeId]`

## New Fields

### `nextStopMode` (top-level)

**Type**: `"live" | "last_known" | null`

| Condition | Value |
|-----------|-------|
| `isRunning === true` | `"live"` |
| `!isRunning`, `includeLastKnown=true`, progress has `nextStopId` | `"last_known"` |
| Otherwise | `null` |

### `etaStatus` (inside `progress`)

**Type**: `"estimated" | "overdue" | "none"`

| Condition | Value |
|-----------|-------|
| Valid future ETA from any branch | `"estimated"` |
| Segment or schedule prediction ≤ now, stop still pending | `"overdue"` |
| No next stop or no ETA target | `"none"` |

## Changed Behavior

### `etaNextStopMinutes` (inside `progress`)

**Before**: `number | null` — always `≥ 0` when a next stop exists (overdue clamped to 0).

**After**: `number | null` — may be `null` when `etaStatus = "overdue"` even though `nextStopId` is set. GPS branch `0` remains valid.

### `nextStop` and `currentStopIndex` (top-level)

**Before**: Always `null` when `isRunning === false`.

**After**: Populated from `progress.nextStopId` when `includeLastKnown=true` and `nextStopMode = "last_known"`.

## Backward Compatibility

- New fields (`nextStopMode`, `etaStatus`) are additive — clients that don't read them are unaffected.
- `etaNextStopMinutes = null` with `nextStopId != null` is a new combination. Clients that assume `nextStopId → etaNextStopMinutes != null` need updating.
- `nextStop` populated for non-running routes is new but only when `includeLastKnown=true` is explicitly requested.

## Example Responses

Note: `GET /api/routes` wraps in `{ "routes": [...], "serverTime": "..." }`. `GET /api/routes/[routeId]` wraps in `{ "route": {...}, "serverTime": "..." }`. Examples below show the **route object** inside that envelope.

### Running route with valid ETA (`GET /api/routes/[routeId]`)
```json
{
  "route": {
    "isRunning": true,
    "nextStopMode": "live",
    "nextStop": { "stopName": "Terminal", "time": "14:30", "id": "abc" },
    "currentStopIndex": 3,
    "progress": {
      "etaStatus": "estimated",
      "etaNextStopMinutes": 8,
      "etaNextStopISO": "2026-03-08T14:38:00-03:00",
      "etaSource": "gps"
    }
  },
  "serverTime": "2026-03-08T14:30:00-03:00"
}
```

### Non-running route with last-known data (`GET /api/routes/[routeId]?includeLastKnown=true`)
```json
{
  "route": {
    "isRunning": false,
    "nextStopMode": "last_known",
    "nextStop": { "stopName": "Centro", "time": "15:00", "id": "def" },
    "currentStopIndex": 5,
    "progress": {
      "etaStatus": "none",
      "etaNextStopMinutes": null,
      "etaNextStopISO": null,
      "etaSource": null
    }
  },
  "serverTime": "2026-03-08T15:45:00-03:00"
}
```

### Overdue degraded ETA (`GET /api/routes/[routeId]`)
```json
{
  "route": {
    "isRunning": true,
    "nextStopMode": "live",
    "nextStop": { "stopName": "Praça", "time": "14:00", "id": "ghi" },
    "currentStopIndex": 2,
    "progress": {
      "etaStatus": "overdue",
      "etaNextStopMinutes": null,
      "etaNextStopISO": "2026-03-08T14:10:00-03:00",
      "etaSource": "segment"
    }
  },
  "serverTime": "2026-03-08T14:25:00-03:00"
}
