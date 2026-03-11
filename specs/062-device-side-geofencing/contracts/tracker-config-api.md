# Contract: Tracker Config API

**Feature**: 062-device-side-geofencing
**Endpoint**: `GET /api/tracker-config/{vanId}`
**Auth**: `x-ingestion-token` header (same as tracking endpoints)

---

## Request

```
GET /api/tracker-config/{vanId}
Headers:
  x-ingestion-token: <per-van-token>
```

No request body.

---

## Response: 200 OK

```json
{
  "geofenceRegions": [
    {
      "placeId": "mundo_plaza",
      "lat": -12.9786676,
      "lng": -38.4610349,
      "radius": 150
    }
  ],
  "configVersion": "2026-03-10T14:30:00.000Z"
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| geofenceRegions | array | List of unique physical places for this van's route |
| geofenceRegions[].placeId | string | `stop_group_id` or coordinate key (`lat.toFixed(6),lng.toFixed(6)`) |
| geofenceRegions[].lat | number | Center latitude |
| geofenceRegions[].lng | number | Center longitude |
| geofenceRegions[].radius | number | Monitoring radius in meters (from `device_geofence_radius_m` or default 150) |
| configVersion | string | ISO timestamp — latest `updated_at` from schedule_entries for this route |

**Behavior**:
- Deduplicates schedule entries by `stop_group_id` or coordinate key (same logic as `inferStopProgress`)
- Returns 5-9 regions per van (based on unique physical locations)
- Empty `geofenceRegions` array disables geofencing for that van (per-van rollback)

---

## Response: 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid ingestion token"
  }
}
```

---

## Response: 404 Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Van not found or no route assigned"
  }
}
```
