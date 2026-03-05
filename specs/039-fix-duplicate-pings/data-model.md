# Data Model: Fix Duplicate Pings

## Database Changes

### van_location_pings (modified)

**New constraint** (migration 00006):

```sql
-- Unique constraint + index (replaces missing index on device_ts)
UNIQUE INDEX idx_van_location_pings_van_device_ts ON van_location_pings (van_id, device_ts)
```

**Existing columns** (unchanged):

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid (PK) | no | gen_random_uuid() |
| van_id | uuid (FK→vans) | no | |
| device_id | uuid | no | |
| lat | double precision | no | |
| lng | double precision | no | |
| accuracy_m | double precision | yes | |
| speed_mps | double precision | yes | |
| heading_deg | double precision | yes | |
| device_ts | timestamptz | no | GPS fix timestamp |
| received_at | timestamptz | no | DEFAULT now() |

**Existing indexes** (unchanged):
- `idx_van_location_pings_van_received` on `(van_id, received_at DESC)`

**Row size**: ~164 bytes (140 bytes data + 24 bytes index)

### Migration: 00006_dedup_pings.sql

```sql
-- Step 1: Remove existing duplicates (keep earliest id per van_id+device_ts)
DELETE FROM van_location_pings a
  USING van_location_pings b
  WHERE a.van_id = b.van_id
    AND a.device_ts = b.device_ts
    AND a.id > b.id;

-- Step 2: Create unique index (also serves as query index for isNewest)
CREATE UNIQUE INDEX idx_van_location_pings_van_device_ts
  ON van_location_pings (van_id, device_ts);
```

## Client-Side State (AsyncStorage)

### Existing keys (no changes to write paths)

| Key | Type | Written by | Read by (new) |
|-----|------|-----------|---------------|
| `@lastLat` | string (number) | `persistCoords()` in task.ts | Cold-start hydration (new) |
| `@lastLng` | string (number) | `persistCoords()` in task.ts | Cold-start hydration (new) |
| `@lastSentAt` | string (number, ms epoch) | `setLastSentAt()` in task.ts | Cold-start hydration (new) |
| `@locationBuffer` | string (JSON array of LocationPoint) | `addToBuffer()` in buffer.ts | Unchanged |

### New module-level state (task.ts)

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `lastSentTs` | number | 0 | GPS timestamp of last successfully sent ping; prevents duplicate cached fixes |

### Modified constants (task.ts)

| Constant | Old | New | Purpose |
|----------|-----|-----|---------|
| `STATIONARY_MAX_INTERVAL` | (new) | 60_000 | Max interval between stationary pings (ms) |

### Modified constants (tracking.ts)

| Config | Old | New | Purpose |
|--------|-----|-----|---------|
| `timeInterval` | 3000 | 5000 | Location callback interval (ms) |
| `distanceInterval` | 5 | 10 | Minimum distance filter (m) |

## Entity: LocationPoint (unchanged)

```typescript
interface LocationPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  ts: number;
}
```

## State Transitions

### Ping lifecycle (client → server)

```
GPS callback
  → [accuracy filter: >50m → DROP]
  → [duplicate ts guard: ts === lastSentTs → DROP]
  → [stale fix guard: age > 60s → DROP]
  → [stationary suppression: distance=0, elapsed<60s → DROP]
  → [distance+time throttle: <10m AND <5s → DROP]
  → [offline? → BUFFER (with consecutive dedup)]
  → [online → SEND]
      → [server: upsert → duplicate? → ACK(duplicate:true), no downstream]
      → [server: upsert → new row? → isNewest check]
          → [isNewest (strict >)? → OSRM + van update + stop inference]
          → [not newest? → no downstream processing]
```
