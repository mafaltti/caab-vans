# Data Model: Device-Side Geofencing

**Feature**: 062-device-side-geofencing
**Date**: 2026-03-11

---

## New Table: `tracking_geofence_events`

Durable ledger for device-side geofence enter events. Keyed by `(van_id, event_id)` for idempotent processing.

| Column | Type | Nullable | Default | Description |
| ------ | ---- | -------- | ------- | ----------- |
| id | uuid | NO | gen_random_uuid() | Primary key |
| van_id | uuid | NO | — | FK → vans(id) |
| event_id | text | NO | — | Client-generated UUID for idempotency |
| place_id | text | NO | — | stop_group_id or coordinate key |
| entered_at | timestamptz | NO | — | Date.now() at callback time on device |
| received_at | timestamptz | NO | now() | Server receive time |
| matched_run_id | uuid | YES | — | FK → route_runs(id), set on match |
| matched_schedule_entry_id | uuid | YES | — | FK → schedule_entries(id), set on match |
| status | text | NO | 'received' | Lifecycle: received → matched/no_match |

**Constraints**:
- `PRIMARY KEY (id)`
- `UNIQUE (van_id, event_id)` — idempotency key
- `CHECK (status IN ('received', 'matched', 'no_match'))`
- `FOREIGN KEY (van_id) REFERENCES vans(id)`
- `FOREIGN KEY (matched_run_id) REFERENCES route_runs(id)`
- `FOREIGN KEY (matched_schedule_entry_id) REFERENCES schedule_entries(id)`

**Indexes**:
- `idx_tge_van_status ON (van_id, status)` — query events by van and lifecycle state

**State transitions**:
```
received ──→ matched    (stop found and marked passed)
received ──→ no_match   (no eligible stop found / no active shift)
```

**Insert semantics**: `INSERT ... ON CONFLICT (van_id, event_id) DO NOTHING` — existing rows are never overwritten. Re-processing happens by checking existing row state after a conflict.

---

## Modified Table: `schedule_entries`

### New column: `device_geofence_radius_m`

| Column | Type | Nullable | Default | Description |
| ------ | ---- | -------- | ------- | ----------- |
| device_geofence_radius_m | integer | YES | NULL | Radius for OS-level geofencing on device. NULL = use default (150m). Separate from `geofence_radius_m` (server-side inference). |

### New column: `updated_at`

| Column | Type | Nullable | Default | Description |
| ------ | ---- | -------- | ------- | ----------- |
| updated_at | timestamptz | NO | now() | Auto-set on UPDATE via `set_updated_at()` trigger. Used for `configVersion` computation. |

**Trigger**: `trg_schedule_entries_updated_at BEFORE UPDATE` → calls existing `set_updated_at()` function.

---

## Modified Table: `route_run_stops`

### Updated constraint: `pass_source`

Old: `CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual'))`

New: `CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual', 'device_geofence'))`

Migration approach: `DROP CONSTRAINT` then `ADD CONSTRAINT` with new value list.

---

## Tracker-Side State (AsyncStorage)

### New keys

| Key | Type | Description |
| --- | ---- | ----------- |
| `@geofenceRegions` | `{ placeId: string, lat: number, lng: number, radius: number }[]` | Cached stop locations for geofence registration |
| `@geofenceConfigVersion` | `string` | ISO timestamp from last successful config fetch |
| `@geofenceEventBuffer` | `{ placeId: string, enteredAt: number, eventId: string }[]` | Buffered geofence enter events awaiting server confirmation |

### Existing keys (unchanged)

`@trackingEnabled`, `@locationBuffer`, `@lastLat`, `@lastLng`, `@lastSentTs`, `@lastError`, `@consecutiveFailures`, `@backoffUntil`, `@authPaused`, `@lastTaskInvocationAt`, `@settings`, `@deviceId`, `@diagLog`

---

## Entity Relationships

```
vans ──1:N──→ tracking_geofence_events (van_id)
route_runs ──1:N──→ tracking_geofence_events (matched_run_id)
schedule_entries ──1:N──→ tracking_geofence_events (matched_schedule_entry_id)

schedule_entries ──uses──→ device_geofence_radius_m (config endpoint)
schedule_entries ──uses──→ updated_at (configVersion computation)

route_run_stops.pass_source ──now includes──→ 'device_geofence'
```

---

## TypeScript Type Changes

### Server: `src/types/index.ts`

```typescript
// Before:
export type PassSource = "geofence_raw" | "geofence_snapped" | "backfill" | "manual";

// After:
export type PassSource = "geofence_raw" | "geofence_snapped" | "backfill" | "manual" | "device_geofence";
```

### Tracker: `apps/van-tracker/src/types.ts`

```typescript
// New types:
interface GeofenceRegion {
  placeId: string;
  lat: number;
  lng: number;
  radius: number;
}

interface GeofenceEvent {
  placeId: string;
  enteredAt: number;
  eventId: string;
}

interface TrackerConfig {
  geofenceRegions: GeofenceRegion[];
  configVersion: string;
}
```
