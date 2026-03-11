# API Contracts: Schedule Time Split

**Feature**: 063-schedule-time-split
**Date**: 2026-03-11

## Modified Endpoints

### GET /api/routes

**Schedule entries in response** (per route):

```json
{
  "stopName": "Terminal Rodoviário",
  "arrivalTime": "07:00",
  "departureTime": "07:05",
  "stopSequence": 1
}
```

### GET /api/routes/:routeId

**Schedule array in response**:

```json
{
  "schedule": [
    {
      "id": "uuid",
      "stopName": "Terminal Rodoviário",
      "arrivalTime": "07:00",
      "departureTime": "07:05",
      "stopSequence": 1,
      "stopLat": -12.9714,
      "stopLng": -38.5124
    }
  ]
}
```

**NextStop in response**:

```json
{
  "nextStop": {
    "stopName": "Praça da Sé",
    "arrivalTime": "07:30",
    "departureTime": "07:30",
    "id": "uuid"
  }
}
```

### GET /api/admin/routes/:routeId/schedule

**Response**:

```json
{
  "entries": [
    {
      "id": "uuid",
      "stopName": "Terminal Rodoviário",
      "arrivalTime": "07:00",
      "departureTime": "07:05",
      "stopSequence": 1,
      "stopLat": -12.9714,
      "stopLng": -38.5124,
      "stopGroupId": "terminal-rod"
    }
  ]
}
```

### POST /api/admin/routes/:routeId/schedule

**Request body**:

```json
{
  "stopName": "Nova Parada",
  "arrivalTime": "07:15",
  "departureTime": "07:15",
  "stopLat": -12.9800,
  "stopLng": -38.5200,
  "stopGroupId": null
}
```

**Response** (201 Created):

```json
{
  "entry": {
    "id": "uuid",
    "stopName": "Nova Parada",
    "arrivalTime": "07:15",
    "departureTime": "07:15",
    "stopSequence": 4,
    "stopLat": -12.9800,
    "stopLng": -38.5200,
    "stopGroupId": null
  }
}
```

**Validation errors** (400):
- `arrivalTime` missing or invalid format
- `departureTime` missing or invalid format
- `departureTime < arrivalTime`

### PUT /api/admin/routes/:routeId/schedule/:entryId

**Request body**: Same as POST.

**Response** (200): Same shape as POST response.

### DELETE /api/admin/routes/:routeId/schedule/:entryId

**Response**: 204 No Content (unchanged).

## New Endpoint

### PATCH /api/admin/routes/:routeId/schedule/reorder

Bulk-updates stop sequence for all entries in a route.

**Request body**:

```json
{
  "entryIds": ["uuid-1", "uuid-3", "uuid-2", "uuid-4"]
}
```

The array order determines the new sequence: first element gets `stop_sequence = 1`, second gets `2`, etc.

**Validation**:
- `entryIds` must be a non-empty array of UUID strings
- Must contain exactly all entry IDs for the route (no partial reorder, no extra IDs)
- Route must exist and belong to the authenticated admin

**Response** (200):

```json
{
  "entries": [
    { "id": "uuid-1", "stopSequence": 1 },
    { "id": "uuid-3", "stopSequence": 2 },
    { "id": "uuid-2", "stopSequence": 3 },
    { "id": "uuid-4", "stopSequence": 4 }
  ]
}
```

**Error responses**:
- 400: Invalid body, missing/extra entry IDs
- 404: Route not found
- 409: Sequence collision (concurrent write)

## Modified Internal Contracts

### GET /api/driver/routes

Schedule entries returned to driver include both times:

```json
{
  "stopName": "Terminal Rodoviário",
  "arrivalTime": "07:00",
  "departureTime": "07:05"
}
```

### GET /api/tracker-config/:vanId

Schedule ordering changes from `.order("time")` to `.order("stop_sequence")`. Response shape includes the new fields for device-side geofence matching.

### GET /api/routes/:routeId/start and /confirm-start-stop

Internal sort/filter logic switches to `stop_sequence` and `departure_time` for cold-start. Response shapes unchanged (these return route run status, not schedule data directly).
