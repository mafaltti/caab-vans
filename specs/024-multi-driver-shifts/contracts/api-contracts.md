# API Contracts: Multi-Driver Shift Support

## Modified Endpoints

### POST /api/routes/[routeId]/start

Creates a new shift on the route's daily run. Creates the run record if none exists.

**Auth**: Session cookie — `driver` role, must exist in `van_drivers` for the route's van.

**Request**: No body required.

**Success Response** (200):
```json
{
  "shift": {
    "id": "uuid",
    "runId": "uuid",
    "driverId": "uuid",
    "startedAt": "2026-03-02T14:00:00-03:00",
    "endedAt": null
  },
  "run": {
    "id": "uuid",
    "routeId": "uuid",
    "serviceDate": "2026-03-02"
  }
}
```

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Not a driver, or not in `van_drivers` for this route's van |
| 404 | `NOT_FOUND` | Route not found |
| 409 | `CONFLICT` | Another shift is already active on this route today |
| 422 | `VALIDATION_ERROR` | Route has no schedule entries |

---

### POST /api/routes/[routeId]/end

Ends the active shift that the authenticated driver started.

**Auth**: Session cookie — `driver` role, must be the driver who started the active shift.

**Request**: No body required.

**Success Response** (200):
```json
{
  "shift": {
    "id": "uuid",
    "runId": "uuid",
    "driverId": "uuid",
    "startedAt": "2026-03-02T14:00:00-03:00",
    "endedAt": "2026-03-02T18:30:00-03:00"
  },
  "run": {
    "id": "uuid",
    "routeId": "uuid",
    "serviceDate": "2026-03-02"
  }
}
```

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Not a driver, or the active shift was started by a different driver |
| 404 | `NOT_FOUND` | Route not found, or no active shift exists today |

---

### GET /api/driver/routes

Returns routes for all vans the driver is assigned to via `van_drivers`. Includes shift history.

**Auth**: Session cookie — `driver` role.

**Success Response** (200):
```json
{
  "routes": [
    {
      "id": "uuid",
      "name": "Rota CAAB",
      "vanName": "Van 01",
      "totalStops": 15,
      "firstStopTime": "06:00",
      "lastStopTime": "23:40",
      "runStatus": "in_progress",
      "run": {
        "id": "uuid",
        "serviceDate": "2026-03-02"
      },
      "activeShift": {
        "id": "uuid",
        "driverId": "uuid",
        "startedAt": "2026-03-02T14:00:00-03:00",
        "endedAt": null
      },
      "todayShifts": [
        {
          "id": "uuid",
          "driverId": "uuid",
          "driverEmail": "driverA@caab.org.br",
          "startedAt": "2026-03-02T06:00:00-03:00",
          "endedAt": "2026-03-02T13:50:00-03:00"
        },
        {
          "id": "uuid",
          "driverId": "uuid",
          "driverEmail": "driverB@caab.org.br",
          "startedAt": "2026-03-02T14:00:00-03:00",
          "endedAt": null
        }
      ]
    }
  ],
  "serverTime": "18:30"
}
```

- `runStatus`: BFF-derived status (`waiting`, `in_progress`, `idle`, `completed`) from shifts + schedule window. Included at route level per constitution V (computed fields in BFF).
- `run`: Today's route_run or `null`. No longer includes timestamps (those are on shifts).
- `activeShift`: Currently active shift (any driver) or `null`.
- `todayShifts`: All shifts for today, ordered by `startedAt` ascending. Includes driver email for display.

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have driver role |

---

### GET /api/routes/[routeId]

Public route detail. `progress` block derives `runStatus` from shifts.

**Auth**: None (public endpoint).

**Updated `progress` shape**:
```json
{
  "progress": {
    "serviceDate": "2026-03-02",
    "runStatus": "in_progress",
    "shiftStartedAt": "2026-03-02T14:00:00-03:00",
    "nextStopId": "uuid",
    "passedStopIds": ["uuid1", "uuid2"],
    "etaNextStopISO": "2026-03-02T18:35:00-03:00",
    "etaNextStopMinutes": 12,
    "delayMinutes": 3,
    "etaSource": "gps"
  }
}
```

**Between-shifts behavior** (FR-006): When no shift is active but schedule window is open, `progress` is `null`. `scheduleStatus` stays `"active"`. UI shows schedule-only view.

**Field change**: `startedAt` → `shiftStartedAt` (from active shift, not from run).

**Rest of response**: Unchanged (`isRunning`, `nextStop`, `scheduleStatus`, `van`, `schedule`).

---

### GET /api/routes

Public route list. Same shift-based derivation.

**Changes to each route**: Same as `/api/routes/[routeId]` — `progress.shiftStartedAt` replaces `progress.startedAt`, between-shifts `progress` is `null`.

---

### PUT /api/admin/vans/[vanId]

Replace single `driverId` with `driverIds` array.

**Auth**: Session cookie — admin/superuser role.

**Updated request body**:
```json
{
  "name": "Van 01",
  "driverIds": ["uuid-driver-1", "uuid-driver-2"],
  "regenerateToken": false
}
```

- `driverIds` (optional): Full-replace semantics. Deletes existing `van_drivers` rows, inserts new set. Empty array `[]` removes all drivers. Omitting leaves unchanged.
- Each ID validated: must be active user with `role = "driver"`.

**Success Response** (200):
```json
{
  "van": {
    "id": "uuid",
    "name": "Van 01",
    "driverIds": ["uuid-driver-1", "uuid-driver-2"],
    "ingestionToken": "uuid-token",
    "locationUrl": "https://...",
    "locationUpdatedAt": "2026-03-02T18:00:00Z",
    "createdAt": "2026-01-15T10:00:00Z"
  }
}
```

**Error Responses**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 400 | `VALIDATION_ERROR` | Invalid body, or a driverId is not a valid active driver |
| 404 | `NOT_FOUND` | Van not found |

---

### GET /api/admin/vans

Returns all vans with `driverIds` array.

**Auth**: Session cookie — admin/superuser role.

**Success Response** (200):
```json
{
  "vans": [
    {
      "id": "uuid",
      "name": "Van 01",
      "driverIds": ["uuid-driver-1", "uuid-driver-2"],
      "ingestionToken": "uuid-token",
      "locationUrl": "https://...",
      "locationUpdatedAt": "2026-03-02T18:00:00Z",
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

## Breaking Changes Summary

| Endpoint | Change | Impact |
|----------|--------|--------|
| POST .../start | Returns `shift` + `run` instead of `run` with status | Driver UI |
| POST .../end | Returns `shift` + `run` instead of `run` with status | Driver UI |
| GET /api/driver/routes | `run` simplified; added `activeShift`, `todayShifts` | Driver UI |
| GET /api/routes/[routeId] | `progress.startedAt` → `shiftStartedAt`; `progress` null between shifts | Public UI |
| GET /api/routes | Same as above | Public UI |
| PUT /api/admin/vans/[vanId] | `driverId` → `driverIds` array | Admin UI |
| GET /api/admin/vans | `driverId` → `driverIds` array | Admin UI |
