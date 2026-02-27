# Public API Contracts

**Base path**: `/api`
**Auth**: None required (public endpoints)
**Content-Type**: `application/json`

## GET /api/routes

List all routes with computed status.

**Response** `200 OK`:

```json
{
  "routes": [
    {
      "id": "uuid",
      "name": "Rota Centro",
      "isRunning": true,
      "nextStop": {
        "stopName": "Ponto Central",
        "time": "14:30"
      } | null,
      "scheduleStatus": "active" | "ended" | "not_started",
      "van": {
        "id": "uuid",
        "locationUrl": "https://maps.app.goo.gl/...",
        "locationUpdatedAt": "2026-02-26T14:20:00-03:00",
        "isLocationOutdated": false
      }
    }
  ],
  "serverTime": "14:25"
}
```

**Notes**:
- `nextStop` is `null` when schedule has ended or no entries exist.
- `scheduleStatus`: `"active"` = within schedule window, `"ended"` = past
  last entry, `"not_started"` = before first entry.
- `serverTime` is America/Bahia HH:mm for client display consistency.
- All computed fields (`isRunning`, `nextStop`, `isLocationOutdated`,
  `scheduleStatus`) are calculated server-side.

## GET /api/routes/:routeId

Route detail with full schedule and location info.

**Parameters**: `routeId` (uuid)

**Response** `200 OK`:

```json
{
  "route": {
    "id": "uuid",
    "name": "Rota Centro",
    "isRunning": true,
    "nextStop": {
      "stopName": "Ponto Central",
      "time": "14:30"
    } | null,
    "scheduleStatus": "active" | "ended" | "not_started",
    "van": {
      "id": "uuid",
      "locationUrl": "https://maps.app.goo.gl/...",
      "locationUpdatedAt": "2026-02-26T14:20:00-03:00",
      "isLocationOutdated": false
    },
    "schedule": [
      {
        "id": "uuid",
        "stopName": "Ponto Inicial",
        "time": "07:00"
      }
    ]
  },
  "serverTime": "14:25"
}
```

**Errors**:
- `404 Not Found`: Route does not exist.

**Notes**:
- `schedule` is always sorted by `time` ascending.

## GET /api/announcements

List active (non-expired) announcements.

**Response** `200 OK`:

```json
{
  "announcements": [
    {
      "id": "uuid",
      "title": "Rota suspensa amanhã",
      "body": "A rota Centro estará suspensa dia 27/02.",
      "isPinned": true,
      "isUrgent": false,
      "expiresAt": "2026-02-28T23:59:00-03:00" | null,
      "createdAt": "2026-02-26T10:00:00-03:00"
    }
  ]
}
```

**Notes**:
- Sorted by `isPinned DESC`, then `createdAt DESC` (newest first within
  each group).
- Expired announcements are excluded server-side.
