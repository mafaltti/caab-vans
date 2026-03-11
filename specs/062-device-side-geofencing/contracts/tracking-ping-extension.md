# Contract: Tracking Ping Extension

**Feature**: 062-device-side-geofencing
**Endpoint**: `POST /api/tracking/{vanId}` (existing, extended)

---

## Request Extension

The existing ping body gains an optional `geofenceEvents` array:

```json
{
  "deviceId": "uuid-string",
  "lat": -12.978,
  "lng": -38.461,
  "accuracy": 10.5,
  "speed": 5.2,
  "heading": 180,
  "ts": 1741234567890,
  "bufferSize": 0,
  "failureCount": 0,
  "batteryLevel": 0.85,
  "networkType": "cellular",
  "geofenceEvents": [
    {
      "placeId": "mundo_plaza",
      "enteredAt": 1741234500000,
      "eventId": "client-generated-uuid"
    }
  ]
}
```

| New field | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| geofenceEvents | array | No | Buffered device-side geofence enter events |
| geofenceEvents[].placeId | string | Yes | Region identifier from geofence registration |
| geofenceEvents[].enteredAt | number | Yes | Unix ms — `Date.now()` at callback time |
| geofenceEvents[].eventId | string | Yes | Client-generated UUID for idempotency |

**Notes**:
- Events have NO `lat/lng` — the OS callback does not provide GPS coordinates at trigger time
- `placeId` matches `geofenceRegions[].placeId` from the config endpoint
- `enteredAt` is callback delivery time (not exact transition time; Android latency 2-6 min)
- `eventId` is generated client-side for idempotent processing and selective acknowledgment

---

## Response Extension

The existing response gains optional fields:

```json
{
  "received": true,
  "ts": 1741234567890,
  "duplicate": true,
  "processedEventIds": ["client-uuid-1", "client-uuid-2"],
  "configVersion": "2026-03-10T14:30:00.000Z",
  "progress": {
    "pendingPlaceIds": ["forum_ruy_barbosa", "comercio"]
  }
}
```

| New field | Type | Presence | Description |
| --------- | ---- | -------- | ----------- |
| processedEventIds | string[] | When geofenceEvents were submitted | Event IDs confirmed processed — device clears only these from buffer |
| configVersion | string | When van has a route | Top-level. Latest `schedule_entries.updated_at` for this van's route. Always present regardless of run/shift state. |
| progress | object | When active route_run exists | Route progress info |
| progress.pendingPlaceIds | string[] | With progress | Place IDs still awaiting detection — device can discard buffered events for places not in this list |

**Processing order**:
1. Rate limit + auth + timestamp clamp (unchanged)
2. **NEW**: Process `geofenceEvents[]` via dedicated helper (BEFORE ping dedup)
3. Ping upsert + dedup (unchanged)
4. If duplicate + no geofence events → early return (unchanged)
5. If duplicate + has geofence events → skip steps 6-8, jump to step 9
6. OSRM snap (unchanged)
7. Van position update (unchanged)
8. `inferStopProgress()` GPS-only fallback (unchanged)
9. **NEW**: Compute `processedEventIds` (post-healing verification)
10. Return extended response

**Backward compatibility**: Existing trackers without `geofenceEvents` continue working identically. The new response fields are additive — old clients ignore them.
