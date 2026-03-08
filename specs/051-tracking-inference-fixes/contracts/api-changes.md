# API Contract Changes: Tracking Inference Fixes

**Feature**: 051-tracking-inference-fixes
**Date**: 2026-03-07
**Status**: Draft

All changes are additive (new fields) or semantic (changed derivation of existing fields).
No fields are removed.

---

## Routes API (Public)

These endpoints are consumed by the passenger-facing frontend via TanStack Query polling.

### GET /api/routes

**Auth**: Public (no auth required)

#### Response Changes

Current response shape: `{ routes: RouteWithStatus[], serverTime: string }`

**New fields on each route object:**

| Field | Type | Description |
|-------|------|-------------|
| `trackingStatus` | `"live" \| "stale" \| "missing"` | GPS telemetry quality indicator, independent of route lifecycle. `"live"` when last GPS fix < 10 min old, `"stale"` when >= 10 and < 60 min old, `"missing"` when >= 60 min old or no fix ever received. |
| `isTrackingFresh` | `boolean` | Convenience field: `true` when `trackingStatus === "live"`, `false` otherwise. |

**Changed field semantics:**

| Field | Old Derivation | New Derivation |
|-------|----------------|----------------|
| `isRunning` | `withinWindow && locationFresh && runStatus === "in_progress"` | `withinWindow && runStatus === "in_progress"` (GPS freshness requirement removed) |

**New enum value in `progress.etaSource`:**

| Value | When Used |
|-------|-----------|
| `"segment"` | Segment-aware ETA fallback: GPS unavailable but road distance between last passed stop and next stop is known. Uses stored `osrm_distance_m` and historical time factors. |

**Full `progress.etaSource` enum after change:** `"gps" | "gps_osrm" | "segment" | "schedule" | null`

**Example route object (new/changed fields highlighted):**

```jsonc
{
  "id": "uuid",
  "name": "Rota A",
  "isRunning": true,                    // CHANGED: no longer requires GPS freshness
  "trackingStatus": "stale",            // NEW
  "isTrackingFresh": false,             // NEW
  "nextStop": { "stopName": "Escola", "time": "07:30", "id": "uuid" },
  "scheduleStatus": "active",
  "totalStops": 8,
  "currentStopIndex": 3,
  "van": {
    "id": "uuid",
    "locationUrl": "https://...",
    "lastGpsFixAt": "2026-03-07T10:05:00.000-03:00",
    "isLocationOutdated": true,
    "lastLat": -12.97,
    "lastLng": -38.51
  },
  "progress": {
    "serviceDate": "2026-03-07",
    "runStatus": "in_progress",
    "shiftStartedAt": "2026-03-07T06:50:00.000-03:00",
    "nextStopId": "uuid",
    "passedStopIds": ["uuid1", "uuid2"],
    "etaNextStopISO": "2026-03-07T10:35:00.000-03:00",
    "etaNextStopMinutes": 12,
    "delayMinutes": 5,
    "etaSource": "segment"              // NEW possible value
  }
}
```

---

### GET /api/routes/[routeId]

**Auth**: Public (no auth required)

#### Response Changes

Identical changes to `GET /api/routes` above, applied to the single route object in the response.

---

## Admin Vans API (Authenticated)

### GET /api/admin/vans

**Auth**: Requires authenticated admin session

#### Response Changes

**New fields on each van object:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `trackerHealth` | `object` | No | Nested object containing tracker health metrics. |
| `trackerHealth.staleSinceMinutes` | `number \| null` | Yes | Minutes since last GPS fix. `null` if no fix ever received. |
| `trackerHealth.bufferSize` | `number \| null` | Yes | Unsent pings buffered on device. |
| `trackerHealth.failureCount` | `number \| null` | Yes | Consecutive upload failures reported by device. |
| `trackerHealth.batteryLevel` | `number \| null` | Yes | Device battery percentage (0-100). |
| `trackerHealth.networkType` | `string \| null` | Yes | Network type (e.g., `"wifi"`, `"cellular"`). |
| `trackerHealth.isStale` | `boolean` | No | `true` when `staleSinceMinutes > 10`. |
| `trackerHealth.isUnhealthy` | `boolean` | No | `true` when `isStale`, or `bufferSize > 20`, or `failureCount > 3`. |

**Example:**

```jsonc
{
  "id": "uuid",
  "name": "Van 01",
  "trackerHealth": {
    "staleSinceMinutes": 15,
    "bufferSize": 3,
    "failureCount": 0,
    "batteryLevel": 72,
    "networkType": "cellular",
    "isStale": true,
    "isUnhealthy": true
  }
}
```

---

### GET /api/admin/vans/[vanId]

#### Response Changes

Same `trackerHealth` object added to the van response.

---

## Admin Schedule API (Authenticated)

### POST /api/admin/routes/[routeId]/schedule

#### Request Changes

**New optional field:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stopGroupId` | `string \| null` | No | Logical stop group identifier for repeated-stop grouping. Max 100 characters. |

#### Response Changes

| Field | Type | Description |
|-------|------|-------------|
| `stopGroupId` | `string \| null` | The logical stop group identifier, or `null` if not assigned. |

---

### PUT /api/admin/routes/[routeId]/schedule/[entryId]

Same changes as POST above.

### GET /api/admin/routes/[routeId]/schedule

`stopGroupId` included in each entry object in the response.

---

## ETA Source Priority Chain

| Priority | Source | Condition |
|----------|--------|-----------|
| 1 | `"gps_osrm"` | Fresh GPS + OSRM reachable + coordinates available |
| 2 | `"gps"` | Fresh GPS + coordinates available + haversine fallback |
| 3 | `"segment"` | **NEW** — GPS unavailable, road distance known between last passed and next stop |
| 4 | `"schedule"` | Final fallback. Scheduled time + observed delay. |
| — | `null` | No pending stops or no data available. |

---

## Backward Compatibility Notes

1. **`isRunning` semantic change**: Now `true` whenever shift is active and within schedule window, regardless of GPS. Old behavior was considered a bug. Clients should use `trackingStatus` for GPS quality.

2. **`trackingStatus` and `isTrackingFresh`**: Purely additive. Existing clients unaffected.

3. **`etaSource: "segment"`**: Additive enum value. Clients with exhaustive switch must add a case.

4. **`trackerHealth` on admin vans**: Additive nested object. Existing admin clients unaffected.

5. **`stopGroupId` on schedule entries**: Additive optional field. Omitting it stores `null` (backward compatible).

6. **No removed fields**: All existing fields remain unchanged.
