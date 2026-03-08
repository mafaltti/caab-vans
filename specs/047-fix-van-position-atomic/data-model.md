# Data Model: Atomic Van Position Update

**Date**: 2026-03-07
**Feature**: 047-fix-van-position-atomic

## Schema Changes

### New Column: `vans.last_gps_fix_at`

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `last_gps_fix_at` | `timestamptz` | YES | NULL | GPS device timestamp of the most recent position fix |

**Relationship to existing columns**:
- `location_updated_at` — preserved, continues to store server receipt time (audit/admin)
- `last_gps_fix_at` — new, stores the actual GPS device timestamp for freshness/ETA

### New RPC Function: `update_van_position`

**Purpose**: Atomically update a van's current position only if the incoming GPS timestamp is newer than the stored one.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `p_van_id` | UUID | Van identifier |
| `p_lat` | DOUBLE PRECISION | Raw GPS latitude |
| `p_lng` | DOUBLE PRECISION | Raw GPS longitude |
| `p_accuracy_m` | DOUBLE PRECISION | GPS accuracy in meters |
| `p_speed_mps` | DOUBLE PRECISION | Speed in meters/second |
| `p_heading_deg` | DOUBLE PRECISION | Heading in degrees |
| `p_snapped_lat` | DOUBLE PRECISION | OSRM-snapped latitude (nullable) |
| `p_snapped_lng` | DOUBLE PRECISION | OSRM-snapped longitude (nullable) |
| `p_device_ts` | TIMESTAMPTZ | GPS device timestamp |

**Returns**: `BOOLEAN` — `TRUE` if position was updated (newer timestamp), `FALSE` if skipped.

**Guard clause**: `WHERE id = p_van_id AND (last_gps_fix_at IS NULL OR p_device_ts > last_gps_fix_at)`

**Side effects**:
- Sets `location_updated_at = NOW()` (server time for audit)
- Sets all position fields (`last_lat`, `last_lng`, etc.)
- The existing `updated_at` trigger fires automatically

### Backfill

```sql
UPDATE vans
SET last_gps_fix_at = sub.max_ts
FROM (
  SELECT van_id, MAX(device_ts) AS max_ts
  FROM van_location_pings
  GROUP BY van_id
) sub
WHERE vans.id = sub.van_id;
```

After backfill, only vans with zero historical pings will have `last_gps_fix_at = NULL`.

## Entity State Diagram

```text
Van Position Lifecycle:

  [No Position]                    [Has Position]
  last_gps_fix_at = NULL           last_gps_fix_at = T1
       │                                │
       │ First ping (any device_ts)     │ Ping with device_ts > T1
       │ → always accepted              │ → accepted, T1 becomes T2
       ▼                                ▼
  [Has Position]                   [Has Position]
  last_gps_fix_at = device_ts      last_gps_fix_at = T2
                                        │
                                        │ Ping with device_ts <= T2
                                        │ → rejected (no-op)
                                        ▼
                                   [Has Position]
                                   last_gps_fix_at = T2 (unchanged)
```

## TypeScript Type Changes

### `Van` type (`src/types/index.ts`)

Add field:
```typescript
last_gps_fix_at: string | null;
```

### `VanPosition` interface (`src/lib/tracking/eta.ts`)

Rename field:
```typescript
// Before:
locationUpdatedAt: DateTime;

// After:
lastGpsFixAt: DateTime;
```

### API Response Types

Route API response `van` object:
```typescript
// Before:
locationUpdatedAt: string | null;

// After:
lastGpsFixAt: string | null;
```

Note: Admin API may return both `locationUpdatedAt` (audit) and `lastGpsFixAt` (freshness) if useful.

## Migration File

**Filename**: `supabase/migrations/00009_atomic_van_position.sql`

**Contents** (3 operations in order):
1. `ALTER TABLE vans ADD COLUMN last_gps_fix_at timestamptz;`
2. Backfill from `van_location_pings`
3. `CREATE OR REPLACE FUNCTION update_van_position(...)` — the atomic RPC
