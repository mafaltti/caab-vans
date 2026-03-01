# API Contract: Public Route Endpoints — Extended Response

**Feature**: `017-stop-inference-eta`
**Date**: 2026-03-01

## GET /api/routes — Route List

### Response Shape (extended)

```jsonc
{
  "routes": [
    {
      "id": "uuid",
      "name": "Rota Centro",
      "isRunning": true,
      "nextStop": {
        "stopName": "Praça da Sé",
        "time": "08:45",
        "id": "uuid"                          // NEW — schedule entry ID
      },
      "scheduleStatus": "active",
      "totalStops": 8,
      "currentStopIndex": 3,
      "van": {
        "id": "uuid",
        "locationUrl": "https://...",         // existing (deprecated)
        "locationUpdatedAt": "2026-03-01T...",
        "isLocationOutdated": false,
        "lastLat": -12.9714,                  // NEW
        "lastLng": -38.5124                   // NEW
      },
      "progress": {                           // NEW — nullable
        "serviceDate": "2026-03-01",
        "nextStopId": "uuid",
        "passedStopIds": ["uuid1", "uuid2"],
        "etaNextStopISO": "2026-03-01T11:50:00-03:00",
        "etaNextStopMinutes": 8,
        "delayMinutes": 5
      }
    }
  ],
  "serverTime": "08:42"
}
```

### New Fields

| Field | Type | When Present |
|-------|------|--------------|
| `nextStop.id` | `string` | Always (when `nextStop` is not null) |
| `van.lastLat` | `number \| null` | Always (null if no pings received) |
| `van.lastLng` | `number \| null` | Always (null if no pings received) |
| `progress` | `object \| null` | Non-null when a `route_run` exists for today |

### `progress` Object

| Field | Type | Description |
|-------|------|-------------|
| `serviceDate` | `string` | `"YYYY-MM-DD"` in `America/Bahia` |
| `nextStopId` | `string \| null` | Next unpassed stop's schedule entry ID. Null if all passed. |
| `passedStopIds` | `string[]` | IDs of stops with status `"passed"` |
| `etaNextStopISO` | `string \| null` | ISO 8601 predicted arrival time. Null if no ETA computable. |
| `etaNextStopMinutes` | `number \| null` | Ceiling of minutes until predicted arrival. Null if no ETA. |
| `delayMinutes` | `number \| null` | Delay in minutes at last passed stop. Null if no stops passed. |

---

## GET /api/routes/[routeId] — Route Detail

### Response Shape (extended)

```jsonc
{
  "route": {
    "id": "uuid",
    "name": "Rota Centro",
    "isRunning": true,
    "nextStop": {
      "stopName": "Praça da Sé",
      "time": "08:45",
      "id": "uuid"                            // NEW
    },
    "scheduleStatus": "active",
    "totalStops": 8,
    "currentStopIndex": 3,
    "van": {
      "id": "uuid",
      "locationUrl": "https://...",
      "locationUpdatedAt": "2026-03-01T...",
      "isLocationOutdated": false,
      "lastLat": -12.9714,                    // NEW
      "lastLng": -38.5124                     // NEW
    },
    "schedule": [
      { "id": "uuid", "stopName": "Terminal", "time": "08:00" },
      { "id": "uuid", "stopName": "Praça da Sé", "time": "08:45" }
    ],
    "progress": {                             // NEW — nullable
      "serviceDate": "2026-03-01",
      "nextStopId": "uuid",
      "passedStopIds": ["uuid1", "uuid2"],
      "etaNextStopISO": "2026-03-01T11:50:00-03:00",
      "etaNextStopMinutes": 8,
      "delayMinutes": 5
    }
  },
  "serverTime": "08:42"
}
```

Identical extension as the list endpoint. The `schedule` array is unchanged.

---

## GET /api/admin/routes/[routeId]/schedule — Admin Schedule List

### Response Shape (extended)

```jsonc
{
  "entries": [
    {
      "id": "uuid",
      "stopName": "Terminal",
      "time": "08:00",
      "stopLat": -12.9714,                   // NEW — nullable
      "stopLng": -38.5124                    // NEW — nullable
    }
  ]
}
```

### New Fields

| Field | Type | Description |
|-------|------|-------------|
| `stopLat` | `number \| null` | Latitude of the stop |
| `stopLng` | `number \| null` | Longitude of the stop |

---

## POST /api/admin/routes/[routeId]/schedule — Create Schedule Entry

### Request Body (extended)

```jsonc
{
  "stopName": "Terminal",
  "time": "08:00",
  "stopLat": -12.9714,                       // NEW — optional
  "stopLng": -38.5124                        // NEW — optional
}
```

### Validation

| Field | Rule |
|-------|------|
| `stopLat` | Optional. Number between -90 and 90. |
| `stopLng` | Optional. Number between -180 and 180. |

Both must be provided together or both omitted/null.

---

## PUT /api/admin/routes/[routeId]/schedule/[entryId] — Update Schedule Entry

Same extension as POST — accepts optional `stopLat` and `stopLng`.

---

## Backward Compatibility

All new fields are additive:
- `nextStop.id`: New field on existing object. Existing consumers that don't use it are unaffected.
- `van.lastLat` / `van.lastLng`: New nullable fields.
- `progress`: New nullable top-level field. `null` when no tracking data exists — consumers that don't read it see no change.
- `stopLat` / `stopLng` on admin responses: New nullable fields on existing objects.

No existing fields are removed, renamed, or have their type changed.
