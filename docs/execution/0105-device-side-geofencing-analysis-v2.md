# Device-Side Geofencing for CAAB Vans Stop Detection

## 1. Current Problem

The system uses server-side geofence detection: every GPS ping received by the server is checked against stop coordinates. This fails when:

| Failure mode | Frequency | Impact |
|---|---|---|
| Communication blackout (Android kills task, network loss) | Multiple times daily on Vans 02/03/04 | Stops passed during silence are missed permanently |
| Sparse pings (throttle, rate limit, stale guard) | Constant when van is moving fast | At 50km/h, a van crosses 50m in 3.6s; with 5-10s ping intervals, pings can miss the geofence entirely |
| Repeated stop visits at different times | Every route (4-10 visits to the same location per day) | If one visit is missed, the pointer gets stuck and all subsequent progress stalls |

Today's data: Van 03 had a 5-minute blackout (20:17-20:28 UTC), Van 02 hit the rate limit ceiling causing a 4-minute cascade, Van 04 was completely dead for the entire monitoring window. All of these cause missed stops.

---

## 2. Proposed Architecture: Device-Side Geofencing

**Principle:** the device detects proximity to physical places and reports events; the server resolves those events against the canonical schedule and route-run state. Raw GPS pings remain for map display. Stop detection is a separate responsibility delegated to the Android OS, but stop **matching** stays server-side.

### Key Design Constraints

The tracker app is a "dumb GPS reporter." It authenticates via `x-ingestion-token` (per-van), not Supabase Auth or driver credentials. It has zero knowledge of routes, schedule entries, or run state. This design must preserve that separation:

- The tracker must **not** call driver-authenticated endpoints (e.g., `/api/routes/{id}/start`).
- The tracker must **not** maintain a local ordered stop list or do schedule-entry matching (that would drift from server truth, which performs backfill, canonical healing, and manual confirmations).
- The tracker **does** report geofence-enter events keyed by physical place identifier (coordinate key or stop_group_id). The server resolves which schedule entry each event corresponds to.

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    DEVICE (Tracker App)                       │
│                                                               │
│  On boot / tracking-start:                                    │
│         │                                                     │
│         ▼                                                     │
│  GET /api/tracker-config/{vanId}                              │
│  (authenticated via x-ingestion-token)                        │
│         │                                                     │
│         ▼                                                     │
│  Server returns geofence regions:                             │
│  [{ placeId, lat, lng, radius }]                              │
│         │                                                     │
│         ▼                                                     │
│  Register regions with GeofencingClient                       │
│  Persist regions in AsyncStorage for reboot recovery          │
│         │                                                     │
│  ┌──────────────────────┐  ┌───────────────────────────────┐  │
│  │ Foreground Service   │  │ OS Geofencing                 │  │
│  │ (existing)           │  │ (new)                         │  │
│  │                      │  │                               │  │
│  │ GPS every 5s ────────┼──┼─► Map display (unchanged)     │  │
│  │ Send pings to server │  │                               │  │
│  │                      │  │ GeofencingClient              │  │
│  │                      │  │ monitors 6-11 regions         │  │
│  │                      │  │                               │  │
│  │                      │  │ On enter → buffer event       │  │
│  │                      │  │ in AsyncStorage               │  │
│  └──────────────────────┘  └───────────────────────────────┘  │
│                    │                   │                       │
│                    ▼                   ▼                       │
│            ┌──────────────────────────────────────┐           │
│            │ Next ping to server includes:        │           │
│            │ { lat, lng, ts, ...                  │           │
│            │   geofenceEvents: [                  │           │
│            │     { placeId, enteredAt, lat, lng } │           │
│            │   ]                                  │           │
│            │ }                                    │           │
│            └──────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    SERVER                                      │
│                                                               │
│  1. Store ping (existing)                                     │
│  2. Update van position (existing)                            │
│  3. Process geofenceEvents[] (new):                           │
│     a. Look up active route_run for this van                  │
│     b. For each event, resolve placeId against pending        │
│        route_run_stops using stop_group_id / coordinate key   │
│     c. Apply closest-in-time matching (same logic as          │
│        existing inferStopProgress)                            │
│     d. Mark matched stop as passed                            │
│        (pass_source: "device_geofence", confidence: 0.95)    │
│     e. Backfill earlier stops if needed                       │
│  4. Server-side inference (existing, as fallback)             │
│  5. Return progress state in ping response (resync)           │
└──────────────────────────────────────────────────────────────┘
```

### What Happens During a Blackout

```
18:15  Last ping succeeds, van heading toward Mundo Plaza
18:17  Android kills background task → no more pings
18:19  Van enters Mundo Plaza 150m radius
       → Android GeofencingClient fires callback
       → App stores: { placeId: "mp-coord-key", enteredAt: 1741..., lat: -12.978, lng: ... }
18:22  Van leaves Mundo Plaza area
18:25  Task restarts, first ping succeeds
       → Ping includes geofenceEvents: [{ placeId: "mp-coord-key", enteredAt: ..., ... }]
       → Server resolves placeId against pending stops
       → Server applies closest-in-time matching to determine schedule entry
       → Server marks the correct Mundo Plaza visit as passed
```

The stop is captured even though no GPS ping reached the server for 8 minutes. The server -- not the device -- decides which schedule entry the event corresponds to.

---

## 3. Feasibility Assessment

### Expo/React Native Support

| Requirement | Status |
|---|---|
| `expo-location` v55 `startGeofencingAsync()` | Available |
| `expo-task-manager` geofence task | Available |
| `ACCESS_BACKGROUND_LOCATION` permission | Already configured in `app.json` |
| `isAndroidBackgroundLocationEnabled` | Already enabled |
| Foreground service | Already running |

No new dependencies needed. The APIs are already available in the current Expo version.

### Android Geofence Limits

| Constraint | Limit | CAAB Vans need | Status |
|---|---|---|---|
| Max geofence regions | 100 | 6-11 per route | Well within limit |
| Min effective radius | ~100-150m | Need device-specific radius (see section 6) | Separate from server default |
| Entry detection latency | 1-2 min (batched) | Acceptable (buffered anyway) | OK |
| Survives app kill? | Yes (`GeofencingClient` is Play Services) | Critical requirement | Covered |
| Survives device reboot? | No (must re-register) | Need boot recovery (see section 4) | Needs new code |

### Stop Geometry Per Route

| Route | Unique locations | Visits/day to same location | Min inter-stop distance |
|---|---|---|---|
| Rota 01 | 7 | Up to 7 (Mundo Plaza, Comercio, Forum) | 682m |
| Rota 02 | 5 | Up to 10 (Mundo Plaza) | 738m |
| Rota 03 | 9 | Up to 8 (Justica Federal, TRT-5, Mundo Plaza) | 371m |
| Rota 04 | 6 | Up to 10 (Forum Ruy Barbosa) | 738m |

With a 150m device-side radius, the minimum inter-stop distance (371m on Rota 03) leaves a 71m gap between the two closest geofence circles. No overlap -- false matches from adjacent regions will not happen.

### Repeated Stops (The Key Problem)

Mundo Plaza appears 10 times on Rota 02. Each visit is a separate schedule entry with the same coordinates. The device registers **one** geofence region for the physical location and reports every enter event with the same `placeId`.

**Solution: server-side resolution.** The server already has the canonical ordered stop list and the route-run progress state. When a `device_geofence` event arrives for a placeId, the server resolves it against the earliest pending schedule entry at that location, applying its existing closest-in-time matching logic. This is the same resolution that `inferStopProgress` already does for raw GPS proximity -- the only difference is the event source and confidence level.

This avoids the drift problem that would occur if the device maintained its own ordered pending list. The server already handles backfill, canonical healing, and manual confirmations. Adding a parallel state machine on the device would create divergence.

---

## 4. What Changes

### New: Tracker Config Endpoint

The tracker needs stop coordinates to register geofences, but it cannot call the driver-authenticated `/api/routes/{routeId}/start` endpoint. A new tracker-authenticated endpoint is needed:

```
GET /api/tracker-config/{vanId}
Header: x-ingestion-token: <per-van token>

Response:
{
  "geofenceRegions": [
    { "placeId": "stop_group_1", "lat": -12.978, "lng": -38.451, "radius": 150 },
    { "placeId": "stop_group_2", "lat": -12.985, "lng": -38.462, "radius": 150 }
  ],
  "configVersion": "2026-03-10T00:00:00Z"
}
```

- Authenticated via `x-ingestion-token`, same as the tracking endpoints.
- Returns deduplicated physical locations (unique by `stop_group_id` or coordinate key), not individual schedule entries.
- Returns the device-side geofence radius per region (from `device_geofence_radius_m` column or a default of 150m).
- `configVersion` allows the device to skip re-registration when regions have not changed.

### New: Resync Protocol

The tracker can drift if it misses a geofence event or if the server state changes (e.g., manual confirmation by admin). To prevent this, the ping response is extended:

```
Current response:  { received: true, ts: number }
Extended response: { received: true, ts: number, progress?: { ... } }
```

The optional `progress` field includes:
- `configVersion`: if this differs from the device's cached version, the device should re-fetch `/api/tracker-config/{vanId}` and re-register geofences.
- `pendingPlaceIds`: list of placeIds that still have pending stops. If a device has buffered events for placeIds not in this list, they can be discarded.

This is lightweight (only sent when there is an active route run) and piggybacks on existing ping traffic. No extra API calls.

### Tracker App (Expo)

| Change | Description | Effort |
|---|---|---|
| Config fetch on boot | Call `GET /api/tracker-config/{vanId}`, persist regions in AsyncStorage | ~30 lines |
| Geofence registration | Call `startGeofencingAsync` with regions from config | ~25 lines |
| New `stop-geofence-task` | `TaskManager` task that fires on geofence enter, buffers event with placeId + timestamp + coordinates in AsyncStorage | ~40 lines |
| Event piggyback on pings | Drain buffered events into `geofenceEvents[]` field on next ping; clear buffer on successful send | ~20 lines |
| Resync handling | On ping response, check `configVersion`; if changed, re-fetch config and re-register geofences. Discard stale buffered events. | ~25 lines |
| Boot recovery | On app boot, if `@trackingEnabled` is true, re-fetch config and re-register geofences. No route/run/stop state to restore -- only geofence regions. | ~20 lines |
| Geofence teardown | Call `stopGeofencingAsync` when tracking is disabled | ~5 lines |

**Total: ~165 lines of new code in the tracker.** This does not include the complexity of local stop-matching state because that responsibility stays on the server.

### Server

| Change | Description | Effort |
|---|---|---|
| `GET /api/tracker-config/{vanId}` | New endpoint: look up route for van, deduplicate stops by stop_group_id/coord key, return geofence regions with device radius. Auth via x-ingestion-token. | ~60 lines |
| Tracking endpoint: accept events | Extend Zod schema to accept optional `geofenceEvents[]` in ping body | ~15 lines |
| Tracking endpoint: process events | Resolve placeId against pending route_run_stops, apply closest-in-time matching, mark as passed with `device_geofence` source | ~50 lines |
| Tracking endpoint: resync response | Include `progress` field with configVersion and pendingPlaceIds when route run is active | ~20 lines |
| `inferStopProgress` | Skip server-side geofence check for stops already confirmed by device_geofence (higher confidence takes precedence) | ~10 lines |

**Total: ~155 lines of new server code.** Higher than the original estimate because the config endpoint and resync protocol are net-new.

### Database

| Change | Description | Migration needed |
|---|---|---|
| `pass_source` CHECK constraint | Add `'device_geofence'` to the allowed values in `route_run_stops.pass_source` | **Yes** |
| `PassSource` TypeScript union | Add `"device_geofence"` to the union in `src/types/index.ts` | Yes (code change) |
| `device_geofence_radius_m` column | Add nullable integer column on `schedule_entries` (or a global config). Default `NULL` means use 150m for device, leaving existing `geofence_radius_m` (default 50m) untouched for server-side inference. | **Yes** |

Migration file:

```sql
-- Add device_geofence pass source
ALTER TABLE route_run_stops
  DROP CONSTRAINT IF EXISTS route_run_stops_pass_source_check;

ALTER TABLE route_run_stops
  ADD CONSTRAINT route_run_stops_pass_source_check
    CHECK (pass_source IN (
      'geofence_raw', 'geofence_snapped', 'backfill', 'manual', 'device_geofence'
    ));

-- Add device-side geofence radius (separate from server-side geofence_radius_m)
ALTER TABLE schedule_entries
  ADD COLUMN device_geofence_radius_m integer;

COMMENT ON COLUMN schedule_entries.device_geofence_radius_m IS
  'Radius for OS-level geofencing on device. NULL = use default (150m). '
  'Separate from geofence_radius_m which controls server-side inference.';
```

The original document stated "No migration needed" -- this was incorrect. The `pass_source` CHECK constraint (migration `00011_stop_confidence_metadata.sql`) only allows `geofence_raw`, `geofence_snapped`, `backfill`, and `manual`. A new value requires a migration to update the constraint.

---

## 5. What Stays the Same

- **GPS pings for map display** -- unchanged. The foreground service keeps sending pings for the live dot on the map.
- **Server-side geofence as fallback** -- unchanged. For older app versions or if OS geofencing fails, the existing server-side detection still runs using the existing `geofence_radius_m` (50m).
- **OSRM road snapping** -- unchanged. Pings still get snapped for map accuracy.
- **Backfill logic** -- unchanged but less needed. Device geofencing catches most stops; backfill handles edge cases.
- **Rate limiter** -- unchanged. Geofence events piggyback on existing ping requests, no extra API calls.
- **Server-side stop matching logic** -- unchanged in principle. The same closest-in-time matching and stop_group_id resolution is reused for device events.
- **Tracker authentication model** -- unchanged. `x-ingestion-token` per van, no driver auth on the tracker.

---

## 6. Geofence Radius: Device-Side vs Server-Side

The current server-side `geofence_radius_m` default is 50m. This is too small for Android OS-level geofencing, which has an effective accuracy of ~100-150m (uses cell/WiFi positioning, not always GPS).

**Important:** the solution is NOT to change the existing 50m default. The server-side inference code uses `geofence_radius_m` for its own proximity checks on raw GPS pings, which are high-accuracy GPS readings. Changing it to 150m would make server-side inference less precise.

Instead, a separate `device_geofence_radius_m` column is introduced:

| Concern | Column | Default | Used by |
|---|---|---|---|
| Server-side proximity check | `geofence_radius_m` | 50m | `inferStopProgress` in the BFF |
| Device-side OS geofencing | `device_geofence_radius_m` | 150m (when NULL) | Tracker config endpoint |

150m is safe for device-side because:

- Minimum inter-stop distance is 371m (Rota 03) -- 371 - (150 x 2) = 71m gap, no overlap
- At 50km/h, a van spends ~22 seconds inside a 150m radius -- plenty of time for detection
- The device reports actual GPS coordinates at entry time, so the server can verify accuracy
- Per-stop override is possible via `device_geofence_radius_m` for stops that need tighter or wider radius

---

## 7. Boot Recovery: What Actually Needs to Happen

The original document overstated boot recovery capabilities. Here is what the tracker currently persists and what is needed:

| State | Currently persisted? | Needed for geofencing? |
|---|---|---|
| `@trackingEnabled` (boolean) | Yes | Yes -- determines if geofences should be active |
| Throttle/backoff state | Yes | No |
| `@locationBuffer` (unsent pings) | Yes | No |
| Geofence regions | **No** | **Yes -- must be added** |
| Route/run/stop progress | **No** | **No -- server is authoritative** |
| Buffered geofence events | **No** | **Yes -- must be added** |

On device boot or app restart:

1. Check `@trackingEnabled`. If false, do nothing.
2. Load cached geofence regions from AsyncStorage.
3. If cached regions exist, re-register them with `startGeofencingAsync`.
4. On next successful ping, check the `configVersion` in the response. If it differs from the cached version, re-fetch `/api/tracker-config/{vanId}` and re-register.
5. Load any buffered geofence events from AsyncStorage and include them in the next ping.

This means geofence regions and buffered events must be persisted to AsyncStorage -- they are not today. This is new code, not a recovery of existing state.

Android `GeofencingClient` does NOT survive device reboot. Regions must be re-registered. The boot recovery path above handles this.

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `GeofencingClient` not available (no Play Services) | Very low -- all current devices have it | Fall back to server-side detection |
| Geofence event delayed >5 minutes | Low on Android | Events are buffered with timestamps; server uses `enteredAt` not arrival time |
| False entry (GPS drift triggers geofence while parked nearby) | Medium with 150m radius | Server resolves against pending stops and closest-in-time matching; no local sequential state to corrupt |
| Stop coordinates change in admin panel | Low | Resync protocol: server bumps `configVersion`, device re-fetches on next ping |
| Device reboot mid-shift | Occasional | Boot recovery re-fetches config and re-registers geofences |
| Device and server progress diverge | N/A (eliminated) | Device does not track progress; server is sole authority |
| Config endpoint adds load | Very low | Called once per boot/config change, not per ping |

---

## 9. Effort Estimate

| Component | Lines (approx) | Complexity |
|---|---|---|
| Tracker: config fetch + geofence lifecycle | ~80 | Low-medium |
| Tracker: event buffering + piggyback on pings | ~40 | Low |
| Tracker: boot recovery + resync | ~45 | Medium |
| Server: tracker-config endpoint | ~60 | Low-medium |
| Server: event processing in tracking endpoint | ~65 | Medium |
| Server: resync response | ~20 | Low |
| Server: inferStopProgress precedence guard | ~10 | Low |
| Database: migration | ~10 | Low |
| Tests | ~150-200 | Medium |
| **Total** | **~480-530** | |

This is roughly 2x the original estimate. The increase comes from the config endpoint, resync protocol, and migration -- all of which were missing from the original document but are required for correctness.

---

## 10. Summary

| Aspect | Current (server-side) | Proposed (device-side) |
|---|---|---|
| Detection reliability | Depends on ping timing + network | OS-level, works offline |
| Survives blackouts | No | Yes |
| Survives app kill | No | Yes (Play Services) |
| Repeated stop matching | Server closest-in-time | Same server logic, but with device-confirmed entry time |
| Stop-matching authority | Server only | Server only (device reports place events, server resolves) |
| Confidence level | 0.3-0.9 (varies) | 0.95 for device events; existing levels for fallback |
| Tracker auth model | x-ingestion-token | x-ingestion-token (unchanged) |
| Battery impact | Already running foreground GPS | Negligible addition (OS batches geofence checks) |
| Code complexity | ~450 lines in `inferStopProgress` | ~165 lines on device + ~155 lines on server + migration |
| Fallback | None | Server-side detection remains as fallback |
| Migration needed | N/A | Yes: pass_source constraint + device_geofence_radius_m column |

The device-side approach is more reliable and covers every failure mode observed in production. It aligns with the industry standard for fleet tracking (device detects proximity, server records and resolves). The existing server-side system stays as a fallback, making this a low-risk addition.

The critical difference from the original design: the tracker remains a dumb GPS reporter that also reports place-proximity events. It does not gain knowledge of routes, schedules, or progress. The server remains the sole authority for stop matching, backfill, and canonical healing.
