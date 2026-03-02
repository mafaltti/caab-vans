# API Contracts: Start Route

## New Endpoints

### POST /api/routes/[routeId]/start

Starts a route run for today. Creates the run if it doesn't exist, or updates an existing one.

**Auth**: Session cookie — driver role, assigned to the van that owns this route.

**Request**: No body required.

**Success Response** (200):
```json
{
  "run": {
    "id": "uuid",
    "routeId": "uuid",
    "serviceDate": "2026-03-02",
    "startedAt": "2026-03-02T18:00:00-03:00",
    "endedAt": null,
    "status": "in_progress"
  }
}
```

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not the assigned driver for this route's van |
| 404 | `NOT_FOUND` | Route not found |
| 409 | `CONFLICT` | Route already started today |
| 422 | `VALIDATION_ERROR` | No schedule entries exist for this route |

---

### POST /api/routes/[routeId]/end

Ends an active route run for today.

**Auth**: Session cookie — driver role, assigned to the van that owns this route.

**Request**: No body required.

**Success Response** (200):
```json
{
  "run": {
    "id": "uuid",
    "routeId": "uuid",
    "serviceDate": "2026-03-02",
    "startedAt": "2026-03-02T18:00:00-03:00",
    "endedAt": "2026-03-02T23:45:00-03:00",
    "status": "completed"
  }
}
```

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not the assigned driver for this route's van |
| 404 | `NOT_FOUND` | Route not found or no active run today |
| 409 | `CONFLICT` | Route already ended today |

---

### GET /api/driver/routes

Returns the authenticated driver's assigned routes with today's run status.

**Auth**: Session cookie — driver role.

**Success Response** (200):
```json
{
  "routes": [
    {
      "id": "uuid",
      "name": "Rota CAAB",
      "vanName": "Van 01",
      "totalStops": 15,
      "firstStopTime": "00:00",
      "lastStopTime": "23:40",
      "run": {
        "id": "uuid",
        "serviceDate": "2026-03-02",
        "status": "waiting",
        "startedAt": null,
        "endedAt": null
      }
    }
  ],
  "serverTime": "18:30"
}
```

`run` is `null` when no route_run exists for today (no GPS pings, no manual start).

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have driver role |

---

## Modified Endpoints

### GET /api/routes/[routeId]

**Change**: Add `runStatus` to the `progress` block.

**Updated `progress` shape**:
```json
{
  "progress": {
    "serviceDate": "2026-03-02",
    "runStatus": "in_progress",
    "startedAt": "2026-03-02T18:00:00-03:00",
    "nextStopId": "uuid",
    "passedStopIds": ["uuid1", "uuid2"],
    "etaNextStopISO": "2026-03-02T18:35:00-03:00",
    "etaNextStopMinutes": 12,
    "delayMinutes": 3,
    "etaSource": "gps"
  }
}
```

New fields in `progress`:
- `runStatus`: `"waiting" | "in_progress" | "completed"` — derived from `started_at`/`ended_at`.
- `startedAt`: ISO timestamp or null.

### PUT /api/admin/vans/[vanId]

**Change**: Accept optional `driverId` field.

**Updated request body** (partial):
```json
{
  "name": "Van 01",
  "driverId": "uuid-or-null"
}
```

### POST /api/admin/users

**Change**: Accept `"driver"` in role enum.

**Updated role values**: `"admin" | "superuser" | "driver"`

### PUT /api/admin/users/[userId]

**Change**: Accept `"driver"` in role enum.

**Updated role values**: `"admin" | "superuser" | "driver"`
