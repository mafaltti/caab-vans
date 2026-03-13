# Device-Side Geofencing: Complete Change Analysis

> Reference document for specification, planning, and implementation.
> Covers current state, proposed change, impact on existing code, conflict risks, and effort estimate.

---

## 1. Problem Statement

Stop detection is 100% server-side today. The server runs `inferStopProgress()` on every received GPS ping, checking haversine distance from the van's position to pending stops within a 50m radius. This fails when no pings arrive:

| Failure mode | Observed frequency | Root cause |
|---|---|---|
| Android kills foreground service | Multiple times daily (Vans 02/03/04) | OS battery optimization, OEM restrictions |
| Network loss (tunnel, dead zone) | Multiple times daily | No cellular coverage |
| Rate-limit cascade (429 backoff spiral) | Daily (Van 02, 4-min cascade on 2026-03-10) | 40 req/min ceiling + exponential backoff |
| Sparse pings miss 50m geofence | Constant when van is moving fast | At 50km/h, van crosses 50m in 3.6s; with 3-5s ping intervals, pings can straddle the zone |
| Tracker completely dead | Occasional (Van 04, entire monitoring window on 2026-03-10) | Unknown — possibly OEM kill + no boot recovery |

**Core insight:** The server can only detect stops when pings arrive. No pings = no detection. The device is the only actor present at the physical location at all times.

---

## 2. Current Architecture

### Tracker App (Expo/React Native)

**Location:** `apps/van-tracker/`

A "dumb GPS reporter" with zero knowledge of routes, stops, schedules, or shifts.

| Aspect | Detail |
|---|---|
| Runtime | Expo SDK 55, React Native 0.83.2 |
| Location | expo-location ~55.1.2 + expo-task-manager ~55.0.9 |
| Task name | `background-location-task` |
| Foreground service | Yes (`killServiceOnDestroy: false`) |
| GPS interval | 5s (high accuracy), 10s (battery saver <20%) |
| Distance threshold | 10m to trigger callback |
| Ping endpoint | `POST /api/tracking/{vanId}` |
| Auth | `x-ingestion-token` header (per-van, stored in SecureStore) |
| Offline buffering | AsyncStorage `@locationBuffer`, max 100 points, 24h TTL |
| Boot restart | Custom plugin `withBootRestart` (BroadcastReceiver) |
| Permissions | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` |

**Ping payload:**

```typescript
{
  deviceId: string,    // UUID
  lat: number,         // -90 to 90
  lng: number,         // -180 to 180
  accuracy: number | null,
  speed: number | null,
  heading: number | null,
  ts: number,          // Unix ms (device clock)
  bufferSize?: number,
  failureCount?: number,
  batteryLevel?: number,
  networkType?: "wifi" | "cellular" | "none" | null,
}
```

**Ping response:**

```json
{ "received": true, "ts": 1741... }
```

**Filtering pipeline** (applied on every GPS callback in `task.ts`):

1. Accuracy filter: drop if >50m
2. Duplicate GPS timestamp guard
3. Stale fix guard (cold gap 5min, stationary 2min, moving 1min)
4. Distance+interval throttle (min 5m, min 3s, stationary max 20s)

### Server (Next.js API)

**Tracking endpoint:** `src/app/api/tracking/[vanId]/route.ts`

Processing pipeline per ping:

1. Rate limit check (40 req/min per van)
2. Token validation (`x-ingestion-token` vs `vans.ingestion_token`)
3. Timestamp clamp (future >5min → server time; past >24h → reject)
4. Upsert to `van_location_pings` (dedup on `van_id, device_ts`)
5. OSRM road snapping (optional, best-effort)
6. Atomic van position update via RPC `update_van_position`
7. `inferStopProgress()` — stop detection (best-effort, errors don't fail ping)

### Stop Detection: `inferStopProgress()`

**File:** `src/lib/tracking/infer-stop-progress.ts`

1. Find route for van (`routes` table, 1:1 via `van_id`)
2. Upsert `route_run` for today's `service_date` (America/Bahia)
3. **Gate: require active shift** — query `route_shifts` where `started_at ≤ eventTs` AND `ended_at IS NULL OR ended_at > eventTs`. If no active shift → return `EMPTY_PROGRESS`
4. Seed `route_run_stops` (one per `schedule_entry`, all `pending`)
5. Fetch pending stops with coordinates, group by `stop_group_id` or `${lat.toFixed(6)},${lng.toFixed(6)}`
6. For each coordinate group:
   - Choose effective position (raw vs snapped via `effective-position.ts`)
   - Check `haversineDistance ≤ geofence_radius_m` (default 50m)
   - Filter by early arrival window (30 min before scheduled time)
   - Pick closest-in-time match among eligible stops
   - Score confidence (0.65-0.95 based on source, multi-ping, snap quality)
   - Mark as passed (`pass_source`, `pass_confidence`, `passed_at`)
7. Confidence-gated backfill (if max confidence >0.7, fill gaps before confirmed stop)
8. Enforce canonical prefix (revert non-contiguous passed stops to pending)
9. Persist progress pointers (`last_passed_stop_id`, `next_stop_id`)

### Shift Lifecycle (Unchanged by This Change)

- **Driver starts shift** via `POST /api/routes/{routeId}/start` (Supabase Auth, driver role)
- **Driver ends shift** via `POST /api/routes/{routeId}/end`
- **Tracker has zero shift awareness** — it sends GPS pings regardless
- **`inferStopProgress` gates on active shift** — events outside a shift are discarded
- **Device-side geofencing does NOT change this** — the server gate handles it

### Database Schema (Relevant Tables)

**`schedule_entries`:**
```sql
id              uuid PRIMARY KEY
route_id        uuid REFERENCES routes(id)
stop_name       text NOT NULL
time            time NOT NULL              -- HH:mm, fixed daily recurrence
stop_lat        double precision
stop_lng        double precision
geofence_radius_m integer DEFAULT 50       -- server-side radius
stop_group_id   text                       -- groups same physical location
UNIQUE (route_id, time)
```

**`route_run_stops`:**
```sql
run_id              uuid REFERENCES route_runs(id)
schedule_entry_id   uuid REFERENCES schedule_entries(id)
status              text DEFAULT 'pending' CHECK (status IN ('pending', 'passed'))
passed_at           timestamptz
pass_source         text CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual'))
pass_confidence     numeric CHECK (0.0 <= pass_confidence <= 1.0)
PRIMARY KEY (run_id, schedule_entry_id)
```

**`route_shifts`:**
```sql
id          uuid PRIMARY KEY
run_id      uuid REFERENCES route_runs(id)
driver_id   uuid
started_at  timestamptz NOT NULL
ended_at    timestamptz           -- NULL while active
```

### Stop Geometry

13 unique physical locations across Salvador/Lauro de Freitas. 154 total schedule entries across 4 vans.

| Route | Unique locations | Total entries | Most repeated stop | Min inter-stop distance |
|---|---|---|---|---|
| Rota 01 (van1) | 7 | 31 | Mundo Plaza, Comércio, Fórum | 682m |
| Rota 02 (van2) | 5 | 40 | Mundo Plaza (10x) | 738m |
| Rota 03 (van3) | 9 | 44 | Justiça Federal, TRT-5, Mundo Plaza | 371m |
| Rota 04 (van4) | 6 | 39 | Fórum Ruy Barbosa (10x) | 738m |

With 150m device-side radius, minimum gap between adjacent geofence circles = 371 - (150 × 2) = **71m** (no overlap).

---

## 3. Proposed Change: Device-Side Geofencing

### Principle

The device detects proximity to physical places via Android OS-level geofencing and reports events to the server. The server resolves events against the canonical schedule and route-run state. Raw GPS pings remain for map display. Stop detection becomes a **dual-source** system: device events (primary, high confidence) and server-side inference (fallback, lower confidence).

### Design Constraints (Preserved)

- Tracker remains a "dumb reporter" — reports place-proximity events, not schedule matches
- Tracker authenticates via `x-ingestion-token` only — no driver auth, no Supabase Auth
- Tracker has zero knowledge of routes, schedules, run state, or shifts
- Server remains sole authority for stop matching, backfill, and canonical healing
- Driver starts/ends shift from the driver app (unchanged)
- `inferStopProgress` shift gate remains the gatekeeper (unchanged)

### Expo Geofencing Compatibility

| Requirement | Status |
|---|---|
| `expo-location` ~55.1.2 `startGeofencingAsync()` | Available |
| `expo-task-manager` ~55.0.9 geofence task | Available |
| `ACCESS_BACKGROUND_LOCATION` | Already configured |
| Foreground service | Already running |
| Parallel with `startLocationUpdatesAsync` | Compatible (separate `TaskConsumer` classes) |
| Survives foreground service kill | Yes (app process alive, location task stalled — GeofencingClient still fires callbacks) |
| Survives full app termination | **No** — Expo does not restart a terminated app for geofencing events on Android. Boot recovery BroadcastReceiver handles cold restart. |
| Survives device reboot | No (must re-register — boot recovery handles this) |
| Max geofence regions | 100 (CAAB needs 5-9 per van) |
| Min effective radius | 100-150m recommended |
| No new permissions needed | Confirmed |
| No new native dependencies | Confirmed |
| SDK 55 killed-app geofencing fix (PR #20571) | **NOT included** — PR was closed without merging on 2026-02-10 (code refactored, no longer applicable). Expo uses broadcast PendingIntent which cannot restart a terminated app. Native Android's `GeofencingClient` supports service PendingIntent for app restart, but Expo does not expose this. |

### Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DEVICE (Tracker App)                               │
│                                                                      │
│  On tracking start / boot recovery:                                  │
│    GET /api/tracker-config/{vanId}                                   │
│    (auth: x-ingestion-token)                                         │
│         │                                                            │
│         ▼                                                            │
│    Cache regions in AsyncStorage (@geofenceRegions)                  │
│    Register with startGeofencingAsync(GEOFENCE_TASK, regions)        │
│                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ Foreground Service   │  │ OS Geofencing (new)                  │  │
│  │ (existing, unchanged)│  │                                      │  │
│  │                      │  │ GeofencingClient monitors             │  │
│  │ GPS every 5s ────────┤  │ 5-9 regions per van                  │  │
│  │ Filter + throttle    │  │                                      │  │
│  │ Send ping to server  │  │ On enter → buffer event in           │  │
│  │                      │  │ AsyncStorage (@geofenceEventBuffer)  │  │
│  └──────────────────────┘  └──────────────────────────────────────┘  │
│                    │                   │                              │
│                    ▼                   ▼                              │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │ Next ping to server includes:                            │        │
│  │ { deviceId, lat, lng, ts, ...,                           │        │
│  │   geofenceEvents: [                                      │        │
│  │     { placeId, enteredAt, eventId }                      │        │
│  │   ]                                                      │        │
│  │ }                                                        │        │
│  │ NOTE: Expo geofence callback provides eventType +        │        │
│  │ region only — no fresh GPS fix at trigger time.          │        │
│  │ enteredAt = Date.now() at callback, placeId =            │        │
│  │ region.identifier. Server uses placeId to resolve        │        │
│  │ the stop coordinates from schedule_entries.              │        │
│  │                                                          │        │
│  │ Clear @geofenceEventBuffer on confirmed processing      │        │
│  │ (see Risk 6 — not on duplicate ping 200).                │        │
│  └──────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    SERVER                                             │
│                                                                      │
│  1. Rate limit, auth, timestamp clamp (existing, unchanged)          │
│  2. NEW: Extract geofenceEvents[] from body BEFORE dedup check       │
│     Call dedicated helper: processDeviceGeofenceEvents()              │
│     (new file: src/lib/tracking/process-device-geofence-events.ts)   │
│     - INSERT each event into tracking_geofence_events                │
│       ON CONFLICT DO NOTHING (never overwrite existing rows)         │
│     - For new events: route/run/shift lookup + gate, resolve          │
│       placeId → pending stops, mark passed, update event status      │
│     - For retried events where matched stop was healed back to       │
│       pending (or status='received'): re-attempt matching            │
│     - For retried events already resolved: skip                      │
│     - Returns tentativeMatchIds[] (not final — healing may revert)   │
│  3. Upsert van_location_pings (existing, unchanged — dedup here)     │
│     CHANGED: If ping is duplicate AND geofenceEvents were present,   │
│     do NOT return early. Skip steps 4-6 (no GPS work to do) but      │
│     continue to step 7 to compute processedEventIds.                 │
│     Only return early for duplicate pings with NO geofence events    │
│     (preserves existing behavior for pure-GPS pings).                │
│  4. OSRM snap (existing, skipped for duplicate pings)                │
│  5. Update van position (existing, skipped for duplicate pings)      │
│  6. inferStopProgress() — GPS-ONLY fallback, NO geofence events:     │
│     Skipped for duplicate pings. Canonical healing still runs        │
│     because step 2's helper already seeded/updated route_run_stops,  │
│     and the NEXT non-duplicate ping will run healing. For the        │
│     current request, step 7 checks live DB state which reflects      │
│     the most recent healing pass.                                    │
│  7. Compute final processedEventIds (runs for ALL requests with      │
│     geofence events, including duplicate pings):                     │
│     Query tracking_geofence_events WHERE van_id = vanId AND          │
│     event_id IN (submitted eventIds) AND status='matched' AND        │
│     the matched_schedule_entry_id is still 'passed' in               │
│     route_run_stops. Events whose stops are 'pending' (healed or     │
│     not yet connected) are NOT acked — device retries next ping.     │
│  8. Return response (EXTENDED):                                      │
│     { received, ts, processedEventIds?, configVersion?,              │
│       progress?: { pendingPlaceIds } }                               │
│     NOTE: configVersion is TOP-LEVEL (route-config concern,          │
│     not progress-dependent — must be available during idle/no-run)   │
└──────────────────────────────────────────────────────────────────────┘
```

### What Happens During a Blackout

```
18:15  Last ping succeeds, van heading toward Mundo Plaza
18:17  Android kills foreground service → no more pings
       (app process still alive — GeofencingClient active)
18:19  Van enters Mundo Plaza 150m radius
       → GeofencingClient (Play Services) fires callback
       → App stores: { placeId: "mundo_plaza", enteredAt: 1741... }
       (no GPS fix from callback — only region identifier + timestamp)
18:22  Van leaves Mundo Plaza area
18:25  Foreground service restarts, first ping succeeds
       → Ping includes geofenceEvents: [{ placeId: "mundo_plaza", enteredAt: ... }]
       → Server resolves placeId → earliest pending Mundo Plaza schedule entry
       → Server marks as passed (device_geofence, 0.90-0.95 tiered)

NOTE: If the app process is fully killed (not just the foreground
service), geofence callbacks will NOT fire. The boot recovery
BroadcastReceiver handles full restart, but events during the dead
window are lost. This covers "tracker completely dead" only after
the next boot/restart cycle.
```

Stop captured despite 8-minute ping blackout.

---

## 4. Impact on Current Architecture: File-by-File Analysis

### STAYS AS-IS (zero code changes)

| File | Role | Why unchanged |
|---|---|---|
| `src/lib/tracking/seed-route-run-stops.ts` | Create initial `pending` stop slots | Slots still needed for both device and server-side detection |
| `src/lib/tracking/haversine.ts` | Distance/bearing math | Still used by ETA, fallback inference |
| `src/lib/tracking/eta.ts` | ETA computation | Reads only `status` and `passed_at`, never `pass_source` |
| `src/lib/tracking/resolve-route-progress.ts` | Progress state for public pages | Has its own contiguous prefix logic (lines 148-161) that independently demotes non-contiguous passed rows for ETA. No `pass_source` awareness — works on `status` only. No changes needed as long as device events participate in normal canonical healing (see Risk 2 revision). |
| `src/lib/time.ts` | Timezone, staleness thresholds | Constants serve ETA/display, not just stop detection |
| `apps/van-tracker/src/location/task.ts` | GPS filtering pipeline | Serves map display; stop detection is now device-side |
| `apps/van-tracker/src/storage/buffer.ts` | Offline GPS buffer | GPS buffer unchanged; geofence events use separate buffer |

### DEMOTES TO FALLBACK (code stays, runs only when no device event)

| File | Current role | New role | Dead in happy path? |
|---|---|---|---|
| `src/lib/tracking/infer-stop-progress.ts` lines 133-305 | **Primary** stop detection via GPS haversine | **Fallback** for stops not covered by device events | Yes — skipped when device event matches |
| `src/lib/tracking/effective-position.ts` | Choose raw vs snapped GPS for geofence check | Only runs in fallback path | Yes |
| `src/lib/tracking/infer-stop-progress.ts` lines 254-277 | Confidence scoring (multi-ping, snap quality) | Only for fallback matches | Yes |
| `src/lib/tracking/infer-stop-progress.ts` lines 307-366 | Confidence-gated backfill | Runs for both sources but device backfill is more conservative | Partially |
| OSRM snapping (for stop detection) | Snaps GPS for better geofence matching | Still needed for ETA; stop detection no longer depends on it | For stop detection, yes |

**Lines that become effectively dead in the happy path:** ~120 lines in `infer-stop-progress.ts` (confidence scoring, multi-ping pre-fetch, snap tiering). These remain as the fallback safety net.

### NEEDS MODIFICATION

| File | Change | Lines (approx) |
|---|---|---|
| `src/app/api/tracking/[vanId]/route.ts` | Accept `geofenceEvents[]` in body; call `processDeviceGeofenceEvents()` BEFORE ping dedup (Risk 6 fix); return top-level `configVersion` + `processedEventIds` in response | ~35 |
| `src/lib/validators/tracking.ts` | Add optional `geofenceEvents` array to Zod schema (with `eventId`, no `lat/lng`) | ~15 |
| `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` | Add `"device_geofence"` to geofence guard check | ~2 |
| `src/types/index.ts` | Add `"device_geofence"` to `PassSource` union | ~1 |

**NOT modified:** `src/lib/tracking/infer-stop-progress.ts` — remains GPS-only fallback. Device event processing lives in a dedicated helper (see NEW CODE below).

### NEW CODE (server)

| File | Purpose | Lines (approx) |
|---|---|---|
| `src/lib/tracking/process-device-geofence-events.ts` | Dedicated helper: upsert events into `tracking_geofence_events`, resolve placeId → stops, mark passed with tiered confidence, conservative backfill | ~90 |
| `src/app/api/tracker-config/[vanId]/route.ts` | New endpoint: returns geofence regions for van's route, auth via `x-ingestion-token` | ~60 |

### NEW CODE (tracker)

| File | Purpose | Lines (approx) |
|---|---|---|
| `apps/van-tracker/src/location/geofence-task.ts` | New `TaskManager.defineTask` for geofence enter events; buffers events in AsyncStorage | ~45 |
| `apps/van-tracker/src/api/config.ts` | Fetch `GET /api/tracker-config/{vanId}`, cache regions and configVersion | ~30 |
| Modifications to `tracking.ts` | Add geofence lifecycle (register on start, unregister on stop, boot recovery) | ~35 |
| Modifications to `client.ts` | Drain geofence event buffer into ping body; parse resync response | ~25 |
| Modifications to `tracking-state.ts` | New AsyncStorage keys for geofence state | ~15 |

### DATABASE MIGRATION

```sql
-- 1. Add device_geofence pass source
ALTER TABLE route_run_stops
  DROP CONSTRAINT IF EXISTS route_run_stops_pass_source_check;

ALTER TABLE route_run_stops
  ADD CONSTRAINT route_run_stops_pass_source_check
    CHECK (pass_source IN (
      'geofence_raw', 'geofence_snapped', 'backfill', 'manual', 'device_geofence'
    ));

-- 2. Add device-side geofence radius (separate from server-side geofence_radius_m)
ALTER TABLE schedule_entries
  ADD COLUMN device_geofence_radius_m integer;

COMMENT ON COLUMN schedule_entries.device_geofence_radius_m IS
  'Radius for OS-level geofencing on device. NULL = use default (150m). '
  'Separate from geofence_radius_m which controls server-side inference.';

-- 3. Add updated_at to schedule_entries (needed for configVersion)
-- NOTE: schedule_entries currently has only created_at — no updated_at column.
-- This is required for the configVersion resync protocol.
ALTER TABLE schedule_entries
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_schedule_entries_updated_at
  BEFORE UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Durable ledger for device geofence events (idempotency + audit)
-- Without this table, eventId-based idempotency is meaningless: retries after
-- response loss would double-apply events or fail to ack consistently.
CREATE TABLE tracking_geofence_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id        uuid NOT NULL REFERENCES vans(id),
  event_id      text NOT NULL,             -- client-generated UUID
  place_id      text NOT NULL,             -- stop_group_id or coordinate key
  entered_at    timestamptz NOT NULL,       -- Date.now() at callback time
  received_at   timestamptz NOT NULL DEFAULT now(),
  matched_run_id          uuid REFERENCES route_runs(id),
  matched_schedule_entry_id uuid REFERENCES schedule_entries(id),
  status        text NOT NULL DEFAULT 'received'
                CHECK (status IN ('received', 'matched', 'no_match')),
  UNIQUE (van_id, event_id)                -- idempotency key
);

CREATE INDEX idx_tge_van_status ON tracking_geofence_events (van_id, status);

COMMENT ON TABLE tracking_geofence_events IS
  'Durable ledger for device-side geofence enter events. '
  'Keyed by (van_id, event_id) for idempotent processing. '
  'Status lifecycle: received → matched/no_match. '
  'INSERT ON CONFLICT DO NOTHING — never overwrite existing rows. '
  'Re-delivered events hit the unique constraint and are skipped; '
  'the prior outcome (matched/no_match) is preserved.';
```

---

## 5. New Tracker AsyncStorage Keys

| Key | Type | Purpose |
|---|---|---|
| `@geofenceRegions` | `{ placeId, lat, lng, radius }[]` | Cached stop locations for geofence registration |
| `@geofenceConfigVersion` | `string` | Version from last successful config fetch |
| `@geofenceEventBuffer` | `{ placeId, enteredAt, eventId }[]` | Buffered geofence enter events. `eventId` is a client-generated UUID for idempotency + selective ack. Expo callback provides region identifier + callback timestamp only — no GPS fix. |

**Existing keys — unchanged:**

`@trackingEnabled`, `@locationBuffer`, `@lastLat`, `@lastLng`, `@lastSentTs`, `@lastError`, `@consecutiveFailures`, `@backoffUntil`, `@authPaused`, `@lastTaskInvocationAt`, `@settings`, `@deviceId`, `@diagLog`

---

## 6. Conflict Risks and Mitigations

### Risk 1: Confidence Overwrite

**Scenario:** Server-side inference (confidence 0.90) overwrites a device event (0.90-0.95) for the same stop in the same request cycle.

**Mitigation:** Before server inference marks a stop as passed, check if already passed with equal or higher confidence:

```typescript
if (existingStop.status === "passed" &&
    (existingStop.pass_confidence ?? 0) >= confidence) {
  continue; // preserve higher-confidence source
}
```

### Risk 2: Canonical Prefix Heals Device Events

**Scenario:** Device event for stop D arrives but stops B and C are still pending. Canonical prefix enforcement reverts D to pending. If B/C events never arrive, D is lost.

**Complication:** `resolve-route-progress.ts` (lines 148-161) independently computes a contiguous prefix and demotes non-contiguous passed rows for ETA/progress display. This code has zero `pass_source` awareness. Exempting `device_geofence` from healing in `enforce-canonical-prefix.ts` would NOT prevent `resolve-route-progress.ts` from demoting the same rows — the same table would simultaneously mean "raw evidence" and "canonical truth."

**Mitigation (revised):** Device events participate in normal canonical healing (no exemption). Instead, when a device event marks stop D as passed, immediately backfill the gap-1 predecessor (stop C) at reduced confidence (0.80). The gap-1 backfill + server-side inference on subsequent pings will reconnect the chain.

If canonical healing reverts stop D back to pending, the event's `eventId` is NOT included in `processedEventIds` (computed after healing in `route.ts` step 7 — see Section 11a). The device keeps the event buffered and retries on the next ping. On retry, the ledger row already has `status='matched'` (ON CONFLICT DO NOTHING preserves it), and the stop may have been reconnected by server-side inference in the interim.

### Risk 3: Aggressive Backfill from Device Events

**Scenario:** Device event for stop D (confidence 0.90-0.95) triggers backfill of stops A, B, C even though the van may have skipped them (different route, detour).

**Mitigation:** Device-triggered backfill uses a stricter gate than server inference:
- Device backfill: gap ≤ 1 stop only (immediate predecessor)
- Server backfill: gap ≤ 3 stops (existing behavior, unchanged)

### Risk 4: Duplicate Geofence Enter Events

**Known Android issue:** `GeofencingClient` can fire duplicate Enter events (expo issues #6283, #9314).

**Mitigation:** Dedup in the geofence task callback by `placeId` + time window (e.g., ignore if same placeId entered within last 60 seconds).

### Risk 5: Config Staleness After Admin Changes Stops

**Scenario:** Admin moves a stop's coordinates. Tracker has old cached regions.

**Mitigation:** Resync protocol — server includes `configVersion` in ping response. If it differs from tracker's cached version, tracker re-fetches `/api/tracker-config/{vanId}` and re-registers geofences. Stop coordinate changes are very rare (monthly at most).

**NOTE:** `schedule_entries` currently has no `updated_at` column (only `created_at`). The migration must add `updated_at` + trigger (see Database Migration section).

### Risk 6: Duplicate Ping Silently Drops Geofence Events (CRITICAL)

**Scenario:** After a blackout, the tracker recovers and sends a ping with `geofenceEvents[]`. If that ping's `device_ts` matches an already-stored ping (duplicate), the server returns `{ received: true, duplicate: true }` at line 114 of `route.ts` — **before** `inferStopProgress()` ever runs. The client treats any 200 as success (`client.ts` line 69) and clears the geofence event buffer. The geofence evidence is acknowledged but never processed.

This is especially likely because:
- The tracker sends the **newest point first** (`task.ts` line 337), then replays older buffered points via batch
- A duplicate `device_ts` can occur when the buffer replays a point already sent before the blackout
- The batch endpoint (`tracking-batch/route.ts` line 119) also skips duplicates before inference

**Mitigation:** Geofence events MUST be processed independently of the ping dedup path. Two options:

- **Option A (recommended):** Extract geofence event processing from the ping body. In `route.ts`, after auth validation but **before** the ping upsert+dedup check, extract `geofenceEvents[]` and process them directly (route lookup, shift gate, stop matching). The ping dedup path continues unchanged. The response includes `processedEventIds[]` so the tracker knows which events to clear from its buffer.

- **Option B:** Dedicated endpoint `POST /api/tracking/{vanId}/geofence-events` that accepts and processes geofence events independently of pings. Cleaner separation but adds a second API call.

**Client-side change:** The tracker must NOT clear `@geofenceEventBuffer` on any 200 response. It must clear only the specific events confirmed by the server's `processedEventIds` response field.

---

## 7. Geofence Radius: Two Separate Concerns

| Concern | Column | Default | Used by |
|---|---|---|---|
| Server-side proximity check | `geofence_radius_m` | 50m | `inferStopProgress` (haversine on raw/snapped GPS) |
| Device-side OS geofencing | `device_geofence_radius_m` | 150m (when NULL) | Tracker config endpoint → Android GeofencingClient |

**Why 150m for device-side:**
- Android OS geofencing uses cell/WiFi positioning (not always GPS), effective accuracy ~100-150m
- At 50km/h, van spends ~22 seconds inside 150m radius — reliable detection
- Minimum inter-stop distance is 371m (Rota 03), leaving a 71m gap — no overlap
- Server resolves the stop coordinates from `schedule_entries` via the `placeId` — no GPS fix from the device event itself

**Why NOT change the existing 50m:**
- Server inference uses high-accuracy GPS readings (from the foreground service)
- 50m works well for server-side haversine checks
- Widening it would increase false positives for server inference

---

## 8. Boot Recovery & Lifecycle

### On Tracking Start

1. Call `GET /api/tracker-config/{vanId}` with `x-ingestion-token`
2. Cache regions + configVersion in AsyncStorage
3. Call `startGeofencingAsync(GEOFENCE_TASK, regions)`
4. Start location updates (existing, unchanged)

### On Boot / App Restart (if `@trackingEnabled` is true)

1. Load cached `@geofenceRegions` from AsyncStorage
2. If regions exist → `startGeofencingAsync()` immediately (don't wait for network)
3. Load buffered `@geofenceEventBuffer` → drain into next successful ping
4. On first successful ping → check `configVersion` in response → re-fetch if stale

### On Tracking Stop

1. `stopGeofencingAsync(GEOFENCE_TASK)`
2. Clear `@geofenceRegions`, `@geofenceConfigVersion`, `@geofenceEventBuffer`
3. Stop location updates (existing, unchanged)

### On Resync (every ping response)

1. Parse top-level `configVersion` from response (always present when van has a route, regardless of run/shift state)
2. If differs from `@geofenceConfigVersion` → re-fetch config, re-register geofences
3. Optionally: discard buffered events for placeIds not in `progress.pendingPlaceIds` (only when `progress` is present)

---

## 9. New API Contract: Tracker Config Endpoint

```
GET /api/tracker-config/{vanId}
Header: x-ingestion-token: <per-van-token>

Response 200:
{
  "geofenceRegions": [
    {
      "placeId": "mundo_plaza",
      "lat": -12.9786676,
      "lng": -38.4610349,
      "radius": 150
    },
    ...
  ],
  "configVersion": "2026-03-10T00:00:00Z"
}

Response 401: Invalid or missing ingestion token
Response 404: Van not found or no route assigned
```

**Behavior:**
- Authenticated via `x-ingestion-token` (same as tracking endpoints)
- Looks up the route for the van
- Queries `schedule_entries` for the route
- Deduplicates by `stop_group_id` or coordinate key (same logic as `inferStopProgress`)
- Returns `device_geofence_radius_m` per region (or 150m default if NULL)
- `configVersion` = latest `updated_at` of schedule_entries for this route (requires migration to add `updated_at` column — see Database Migration section)

---

## 10. Extended Ping Contract

### Request (extended)

```typescript
{
  // ... existing fields unchanged ...
  geofenceEvents?: Array<{
    placeId: string,     // stop_group_id or coordinate key (= region.identifier)
    enteredAt: number,   // Unix ms (Date.now() at geofence callback)
    eventId: string,     // Client-generated UUID for idempotency + selective ack
  }>,
}
```

**NOTE:** Expo's geofencing task callback provides `eventType` and `region` only — no fresh GPS fix. The `placeId` comes from `region.identifier` (set at registration time), and `enteredAt` is `Date.now()` captured in the callback. The server resolves stop coordinates from `schedule_entries` via the `placeId`. No `lat/lng` fields on the event.

### Response (extended)

```typescript
{
  received: true,
  ts: number,
  duplicate?: true,
  processedEventIds?: string[],      // Geofence eventIds successfully processed
                                     // Client clears ONLY these from buffer
  configVersion?: string,            // TOP-LEVEL: latest schedule_entries.updated_at
                                     // for this van's route. Always returned when
                                     // van has a route, regardless of run/shift state.
                                     // Route-config concern, not progress-dependent —
                                     // tracker must resync geofences even during idle.
  progress?: {                       // Only when active route_run exists
    pendingPlaceIds: string[],       // placeIds still awaiting detection
  },
}
```

---

## 11. Processing Architecture

Device geofence events and GPS-based inference are processed in **two separate code paths**, both called from `route.ts`. `inferStopProgress()` is NOT modified to handle device events.

### 11a. `processDeviceGeofenceEvents()` — NEW dedicated helper

**File:** `src/lib/tracking/process-device-geofence-events.ts` (new)

Called from `route.ts` BEFORE ping dedup check. Owns the full device event lifecycle.

```
processDeviceGeofenceEvents(supabase, vanId, geofenceEvents[])
  │
  ├─ [1] For each event:
  │      ├─ INSERT into tracking_geofence_events (van_id, event_id, ...)
  │      │   ON CONFLICT (van_id, event_id) DO NOTHING
  │      │   (never overwrite — preserves prior outcome)
  │      ├─ Check insert result + existing row state:
  │      │   ├─ Row inserted (new event) → proceed to [2]
  │      │   ├─ Conflict, existing status='no_match' → skip
  │      │   │   (conditions unchanged within same request)
  │      │   ├─ Conflict, existing status='matched', matched stop
  │      │   │   is still 'passed' → skip (already resolved,
  │      │   │   candidate for processedEventIds in step 7)
  │      │   └─ Conflict, existing status='matched', matched stop
  │      │      is 'pending' (was healed) → RE-PROCESS from [2]
  │      │      (re-attempt mark-passed; backfill or server inference
  │      │      may have reconnected the chain since last attempt)
  │      │   └─ Conflict, existing status='received' (partial failure)
  │      │      → RE-PROCESS from [2]
  │      ├─ Route/run lookup (same queries as inferStopProgress)
  │      ├─ Shift gate (same logic — no active shift → status='no_match')
  │      └─ Seed stops (reuse seedRouteRunStops)
  │
  ├─ [2] Resolve placeId → pending stops by stop_group_id/coord key
  │      ├─ Filter eligible (event.enteredAt ≥ stop.time - 30min)
  │      └─ Pick closest-in-time match
  │
  ├─ [3] Confidence scoring (tiered, not flat 0.95):
  │      ├─ Base: 0.90 (place evidence, but enteredAt is callback
  │      │   delivery time, not exact transition time — Android
  │      │   background geofence latency is 2-6 minutes)
  │      ├─ +0.05 if recent GPS ping (last 5 min) corroborates
  │      │   position within geofence_radius_m of the stop
  │      └─ Cap at 0.95
  │      NOTE: Repeated places (e.g. Mundo Plaza at 13:50 and 14:30
  │      on van2, 40-min gap) make flat 0.95 too aggressive.
  │      Delivery lag can blur the closest-in-time match.
  │
  ├─ [4] Mark passed: pass_source="device_geofence"
  │      Conservative backfill: gap ≤ 1 stop only, confidence=0.80
  │
  ├─ [5] Update tracking_geofence_events:
  │      status → 'matched' (with matched_run_id, matched_schedule_entry_id)
  │      or 'no_match' if no eligible stop found
  │
  └─ Return: tentativeMatchIds[] (event_ids with status='matched')
         NOTE: These are NOT the final processedEventIds. Canonical
         healing in inferStopProgress (step 6) may revert some matched
         stops to 'pending'. Final ack is computed in route.ts step 7
         by checking which matched stops survived healing.
```

### 11b. `inferStopProgress()` — UNCHANGED (GPS-only fallback)

Called from `route.ts` AFTER ping dedup, only for non-duplicate pings. Signature unchanged — no `geofenceEvents` parameter.

**Note on duplicate pings with geofence events:** When a ping is a duplicate but carried geofence events, `inferStopProgress` is skipped (no new GPS data to process). Step 7's `processedEventIds` computation checks live DB state, which reflects the most recent canonical healing from a prior non-duplicate ping. This means a device event on a duplicate ping can only be acked if a previous ping already ran healing and left the matched stop in `passed` state. If not, the event stays buffered and retries on the next non-duplicate ping, which will run full healing.

```
inferStopProgress(vanId, rawLat, rawLng, snappedLat, snappedLng, eventTs)
  │
  ├─ [1] Route/run lookup (EXISTING, unchanged)
  ├─ [2] Shift gate (EXISTING, unchanged)
  ├─ [3] Seed stops (EXISTING, unchanged)
  ├─ [4] Fetch pending stops, group by coordinate key (EXISTING, unchanged)
  │
  ├─ [5] Server-side inference for REMAINING pending stops
  │      ├─ Skip stops already marked passed (by device events or prior pings)
  │      ├─ Effective position selection (raw vs snapped)
  │      ├─ Haversine geofence check (50m radius)
  │      ├─ Confidence scoring (0.65-0.95)
  │      └─ Standard backfill (gap ≤ 3, confidence 0.30-0.70)
  │
  ├─ [6] Enforce canonical prefix (EXISTING, unchanged)
  │      ├─ Walk contiguous passed prefix from start
  │      ├─ Non-contiguous passed stops → revert to pending (ALL sources)
  │      └─ Device events rely on gap-1 backfill to stay connected
  │
  └─ [7] Persist progress pointers (EXISTING, unchanged)
```

---

## 12. Effort Estimate

### Server

| Component | File | Lines (approx) | Complexity |
|---|---|---|---|
| Tracker config endpoint | `src/app/api/tracker-config/[vanId]/route.ts` (new) | ~60 | Low-medium |
| Tracking schema extension | `src/lib/validators/tracking.ts` | ~15 | Low |
| Device event processing helper | `src/lib/tracking/process-device-geofence-events.ts` (new) | ~90 | Medium |
| Geofence event call + configVersion in route.ts | `src/app/api/tracking/[vanId]/route.ts` | ~35 | Medium |
| Resync response + processedEventIds | `src/app/api/tracking/[vanId]/route.ts` | ~15 | Low |
| Confirm-start-stop guard | `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` | ~2 | Trivial |
| PassSource type | `src/types/index.ts` | ~1 | Trivial |
| DB migration | `supabase/migrations/00016_*.sql` | ~35 | Low |
| **Server subtotal** | | **~253** | |

### Tracker App

| Component | File | Lines (approx) | Complexity |
|---|---|---|---|
| Config fetch module | `src/api/config.ts` (new) | ~30 | Low |
| Geofence task definition | `src/location/geofence-task.ts` (new) | ~45 | Low-medium |
| Geofence lifecycle (start/stop/boot) | `src/location/tracking.ts` (modify) | ~35 | Medium |
| Event piggyback on pings + selective ack | `src/api/client.ts` (modify) | ~35 | Low-medium |
| Resync handling | `src/api/client.ts` (modify) | ~20 | Low |
| New AsyncStorage keys | `src/storage/tracking-state.ts` (modify) | ~15 | Low |
| Event buffer dedup | `src/location/geofence-task.ts` | ~10 | Low |
| **Tracker subtotal** | | **~190** | |

### Tests

| Component | Lines (approx) |
|---|---|
| Tracker config endpoint (server) | ~40 |
| processDeviceGeofenceEvents helper | ~80 |
| Tiered confidence + GPS corroboration | ~30 |
| Idempotency (tracking_geofence_events dedup) | ~30 |
| End-to-end: blackout → device event → stop marked | ~40 |
| Duplicate ping does NOT drop geofence events | ~20 |
| Repeated-place disambiguation (e.g. Mundo Plaza 13:50 vs 14:30) | ~30 |
| **Tests subtotal** | **~270** |

### **Total: ~713 lines** (~443 production + ~270 tests)

---

## 13. Implementation Order (Suggested)

### Phase 1: Server Foundation
1. DB migration (add `device_geofence` to pass_source, add `device_geofence_radius_m`, add `updated_at` + trigger to `schedule_entries`)
2. Update `PassSource` type
3. Update confirm-start-stop guard
4. New tracker-config endpoint (using `schedule_entries.updated_at` for `configVersion`)
5. Extend Zod schema to accept `geofenceEvents[]` (with `eventId` for idempotency, no `lat/lng`)
6. New dedicated helper: `process-device-geofence-events.ts` (upsert to `tracking_geofence_events`, resolve placeId, tiered confidence, backfill)
7. Wire helper into `route.ts` BEFORE ping dedup (Risk 6 fix); add top-level `configVersion` + `processedEventIds` to response
8. Server tests (including: duplicate-ping-with-geofence-events, repeated-place disambiguation, idempotent re-delivery)

### Phase 2: Tracker Implementation
10. Config fetch module
11. Geofence task definition (TaskManager) — buffer `{ placeId, enteredAt, eventId }` only (no GPS fix from callback)
12. Geofence lifecycle in tracking.ts (start/stop)
13. Event piggyback on pings in client.ts — selective ack via `processedEventIds` response
14. Resync handling in client.ts
15. Boot recovery
16. Event buffer dedup

### Phase 3: Integration & Validation
17. EAS build for testing
18. Deploy server changes to DEV
19. Field test with one van
20. Monitor: device events arriving, stops being marked, fallback still working
21. Roll out to all vans

---

## 14. What Does NOT Change (Explicit Confirmation)

- GPS ping frequency, filtering, throttling — unchanged
- Ping payload structure (additive only, new optional `geofenceEvents` field with `eventId` for selective ack)
- Van position updates for map display — unchanged
- ETA calculation — unchanged
- OSRM road snapping — unchanged (serves ETA)
- Rate limiter (40 req/min) — unchanged (geofence events piggyback, no extra calls)
- Shift lifecycle (driver starts/ends from driver app) — unchanged
- Tracker authentication model (`x-ingestion-token`) — unchanged
- Public-facing route status pages — unchanged (no `pass_source` in UI)
- Backfill logic — unchanged for server-side matches; stricter for device matches
- Offline GPS buffering — unchanged; geofence events use separate buffer
- Boot restart mechanism — unchanged; adds geofence re-registration step

---

## 15. Success Criteria

| Metric | Before | After (target) |
|---|---|---|
| Stops missed during 5-min blackout | ~100% | <5% |
| Stops missed during foreground service kill (app alive) | 100% | <10% (GeofencingClient covers most) |
| Stops missed during full app termination | 100% | Still ~100% until boot recovery restarts app (geofencing does NOT survive full termination on Expo/Android) |
| Stops missed from sparse pings at speed | ~30-50% | <5% |
| Stops missed from rate-limit cascade | ~20-40% | <5% |
| Average pass_confidence for detected stops | 0.70-0.85 | 0.90-0.95 |
| Server-side inference still functional | N/A | Yes (fallback) |
| False positive rate | Low | Unchanged or lower (device + server agree) |

---

## 16. Rollback Plan

If device-side geofencing causes issues after deployment:

1. **Tracker rollback:** Push a new EAS build without the geofence task. Old tracker versions continue sending pings without `geofenceEvents[]`.
2. **Server rollback:** The `geofenceEvents` field is optional. If absent, the server runs existing inference only. No code removal needed — the fallback IS the old system.
3. **Gradual:** Can disable per-van by returning empty `geofenceRegions[]` from the config endpoint.

The existing server-side pipeline is never removed, only demoted. Rollback is inherently safe.

---

## 17. Review Corrections (2026-03-11)

This section documents corrections applied after external review (Codex). All inline changes have been applied above.

### C1: Killed-app recovery overstated (Section 3, Compatibility table)

**Original claim:** "Survives app kill — Yes (GeofencingClient runs in Play Services)" and "SDK 55 killed-app geofencing fix (PR #20571) — Included"

**Correction:** Expo's `startGeofencingAsync` on Android does NOT automatically restart a terminated app process for geofence callbacks. The `GeofencingClient` runs in Play Services but can only deliver callbacks when the app process is alive. This covers "foreground service killed but app process alive" (the most common failure mode), NOT "app fully terminated."

Additionally, PR #20571 (which proposed switching from broadcast to service PendingIntent) was **closed without merging** on 2026-02-10 because the code had undergone significant refactors. The fix is NOT included in SDK 55.

Note: The existing **location foreground service** (`killServiceOnDestroy: false`) may independently survive app kill — this is a separate mechanism from geofencing. The BroadcastReceiver handles cold restarts after full termination or reboot.

### C2: Geofence event payload not available from Expo (Sections 3, 5, 10)

**Original claim:** Events include `{ placeId, enteredAt, lat, lng }` with GPS coordinates at trigger time.

**Correction:** Expo's geofencing task callback provides `eventType` (enter/exit) and `region` (the registered region object) only — no fresh GPS fix. The `placeId` comes from `region.identifier`, `enteredAt` is `Date.now()` at callback time. Removed `lat/lng` from event payload throughout. Server resolves stop coordinates from `schedule_entries` via `placeId`.

Note: Android's native `GeofencingEvent.getTriggeringLocation()` API DOES provide the device's actual coordinates at trigger time, but Expo's `GeofencingTaskConsumer.kt` never calls it — this data is not passed through to the JS layer. A custom Expo module could expose it, but that would add a native dependency (violating the "no new native dependencies" constraint).

### C3: Duplicate ping silently drops geofence events (Section 6, Risk 6 — NEW)

**Original design:** Geofence events piggyback on pings; clear buffer on any 200 response.

**Problem:** `route.ts` line 113-114 returns `{ received: true, duplicate: true }` for duplicate `device_ts` BEFORE calling `inferStopProgress()`. The client treats any 200 as success (`client.ts` line 69) and would clear the geofence buffer. Evidence is acknowledged but never processed.

**Fix:** Added Risk 6. Geofence events are now processed BEFORE the ping dedup check in `route.ts`. Added `eventId` (client UUID) for idempotency and `processedEventIds` response field for selective buffer clearing.

### C4: inferStopProgress coupling resolved (Section 4, NEEDS MODIFICATION)

**Original estimate:** ~60 lines to add device event processing to `inferStopProgress`.

**Correction:** Function is already 454 lines with 3+ responsibilities. Resolved in Round 2 (C8): device event processing extracted to a dedicated helper (`process-device-geofence-events.ts`). `inferStopProgress` is NOT modified — remains GPS-only fallback.

### C5: Canonical healing conflict resolved (Section 6, Risk 2; Section 11)

**Original design:** Exempt `device_geofence` passes from canonical healing in `enforce-canonical-prefix.ts`.

**Problem:** `resolve-route-progress.ts` (lines 148-161) independently computes a contiguous prefix and demotes non-contiguous passed rows for ETA — with zero `pass_source` awareness. Exempting in one place but not the other creates inconsistency.

**Fix:** Device events participate in normal canonical healing (no exemption). Rely on gap-1 backfill + server inference to reconnect the chain. Removed the exemption from the flow diagram.

### C6: configVersion source added to migration (Section 4, Database Migration)

**Original claim:** `configVersion = latest updated_at of schedule_entries`

**Problem:** `schedule_entries` has `created_at` but no `updated_at` column (never added in any migration). The TypeScript `ScheduleEntry` type also lacks it.

**Fix:** Added `ALTER TABLE schedule_entries ADD COLUMN updated_at` + trigger to the migration section.

---

## 18. Review Corrections Round 2 (2026-03-11)

Second review pass (Codex). All inline changes applied above.

### C7: eventId idempotency has no server-side backing (Section 4, Migration; Section 11)

**Problem:** `eventId` and `processedEventIds` were added to the contract, but no table or durable ledger was defined. Without persisted `(van_id, event_id)` state, retries after response loss are undefined — server can double-apply, fail to ack, or ack inconsistently.

**Fix:** Added `tracking_geofence_events` table to the migration. Keyed by `(van_id, event_id)` with UNIQUE constraint for idempotent upsert. Tracks lifecycle: `received` → `matched`/`no_match`/`duplicate`. The dedicated helper upserts events before processing and records match results. DB migration estimate increased from ~18 to ~35 lines.

### C8: Processing architecture internally inconsistent (Sections 3, 4, 11, 12, 13)

**Problem:** The data flow diagram said geofence events are processed in `route.ts` before dedup, but Section 11 said `inferStopProgress()` processes them, and the implementation order listed both. Two conflicting designs.

**Fix:** Consolidated to a single design: a dedicated `processDeviceGeofenceEvents()` helper in a new file (`src/lib/tracking/process-device-geofence-events.ts`), called from `route.ts` before ping dedup. `inferStopProgress()` is NOT modified — it remains the GPS-only fallback with unchanged signature. Section 11 split into 11a (new helper) and 11b (unchanged `inferStopProgress`). NEEDS MODIFICATION table updated to remove `infer-stop-progress.ts`. Implementation order deduplicated.

### C9: configVersion tied too tightly to progress (Section 10 Response)

**Problem:** `configVersion` was nested under `progress?` which only exists when an active `route_run` is present. But geofence config freshness is a route-config concern — a van can stay on stale geofences during idle/no-run periods when `progress` is null.

**Fix:** Moved `configVersion` to top-level in the response. Always returned when the van has a route, regardless of run/shift state. Updated resync section (Section 8) and data flow diagram to match.

### C10: 0.95 confidence too aggressive for repeated places (Section 11a)

**Problem:** `enteredAt` is callback-delivery time (not exact transition time), and Android background geofence delivery can lag 2-6 minutes. With repeated places like Mundo Plaza at 13:50 and 14:30 (40-min gap on van2), flat 0.95 confidence is too aggressive — delivery lag can blur the closest-in-time match between consecutive visits.

**Fix:** Changed to tiered confidence: 0.90 base (place evidence with imprecise timing), +0.05 if a recent GPS ping (last 5 min) corroborates position within `geofence_radius_m` of the stop. Cap at 0.95. Added a test case for repeated-place disambiguation.

---

## 19. Review Corrections Round 3 (2026-03-11)

Third review pass (Codex). Three targeted fixes.

### C11: processedEventIds acked before canonical healing (Sections 3, 6, 11a)

**Problem:** The helper returned `processedEventIds[]` immediately after marking stops, but canonical healing in `inferStopProgress` (step 6) could revert those stops back to pending. An acked event whose stop was healed would be cleared from the device buffer with no retry.

**Fix:** The helper now returns `tentativeMatchIds[]` (not final). `processedEventIds` is computed in `route.ts` step 7, AFTER canonical healing, by checking which `status='matched'` events in `tracking_geofence_events` still have their `matched_schedule_entry_id` in `passed` state in `route_run_stops`. Events whose stops were healed are NOT acked — the device retries them on the next ping.

### C12: Duplicate-event semantics corrupt the ledger (Sections 4, 11a)

**Problem:** `ON CONFLICT → status='duplicate'` would overwrite a previously `matched` row, losing the prior match outcome. Re-delivered events could not be safely acked.

**Fix:** Changed to `INSERT ... ON CONFLICT (van_id, event_id) DO NOTHING`. Existing rows are never overwritten. If the insert is skipped (event already exists), the prior `matched`/`no_match` status is preserved. Removed `'duplicate'` from the status CHECK constraint. Re-delivered events with `status='matched'` are candidates for `processedEventIds` (subject to post-healing verification in step 7).

### C13: eventId missing from buffer and data-flow payload (Sections 3, 5)

**Problem:** Data-flow diagram showed `{ placeId, enteredAt }` and `@geofenceEventBuffer` type was `{ placeId, enteredAt }[]`, but the request contract and selective ack require `eventId`.

**Fix:** Added `eventId` to both the data-flow payload and the `@geofenceEventBuffer` type.

---

## 20. Review Corrections Round 4 (2026-03-11)

Fourth review pass (Codex). Two failure-state handling fixes.

### C14: Retries are no-ops once a ledger row exists (Sections 3, 11a)

**Problem:** `ON CONFLICT DO NOTHING` + "skip processing" made retries meaningless. A healed event with `status='matched'` would be retried by the device, but the helper would skip it (row exists), and step 7 would not ack it (stop still `pending`). The event is stuck forever — neither re-processed nor acked.

**Fix:** The helper now checks the existing row's state on conflict:
- `status='matched'` + stop still `passed` → skip (already resolved)
- `status='matched'` + stop healed to `pending` → RE-PROCESS from step [2] (re-attempt mark-passed; backfill or inference may have reconnected the chain)
- `status='received'` (partial failure) → RE-PROCESS from step [2]
- `status='no_match'` → skip (conditions unchanged within same request)

This makes retries meaningful: healed events get re-attempted on each delivery until either the stop sticks in `passed` state or the event ages out.

### C15: Duplicate pings return early, skipping processedEventIds computation (Sections 3, 11b)

**Problem:** The current `route.ts` returns at line 114 for duplicate pings. With the "final ack after healing" design, `processedEventIds` must be computed in step 7, which runs after the duplicate check. Duplicate pings with geofence events would never produce `processedEventIds`.

**Fix:** `route.ts` no longer returns early for duplicate pings when `geofenceEvents` were present. It skips steps 4-6 (no GPS work) but continues to step 7 to compute `processedEventIds`. Early return is preserved only for duplicate pings with NO geofence events (existing behavior for pure-GPS pings). Step 7 checks live DB state from the most recent healing pass.
