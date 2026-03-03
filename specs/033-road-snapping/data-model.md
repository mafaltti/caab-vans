# Data Model: Road Snapping for Van GPS Positions

**Feature**: 033-road-snapping
**Date**: 2026-03-03

## Schema Changes

### Table: `vans` — Add Snapped Coordinate Columns

Two new nullable columns store the road-snapped (corrected) GPS position. When the snapping service returns a valid result, these are populated. When snapping fails or is unavailable, they remain `NULL` and the system falls back to `last_lat`/`last_lng`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `snapped_lat` | `double precision` | YES | `NULL` | Road-snapped latitude from OSRM `/match`. `NULL` when snapping unavailable or no match. |
| `snapped_lng` | `double precision` | YES | `NULL` | Road-snapped longitude from OSRM `/match`. `NULL` when snapping unavailable or no match. |

**Migration SQL**:
```sql
ALTER TABLE vans
  ADD COLUMN snapped_lat double precision,
  ADD COLUMN snapped_lng double precision;
```

### No Changes to Other Tables

| Table | Change | Rationale |
|-------|--------|-----------|
| `van_location_pings` | None | Immutable raw GPS audit trail. Must never contain snapped data. |
| `schedule_entries` | None | Stop coordinates are fixed reference points, not GPS data. |
| `route_runs` | None | Route lifecycle, unrelated to position correction. |
| `route_run_stops` | None | Stop progress, unrelated to position correction. |

## Entity Relationships

```
vans
├── last_lat / last_lng          ← Raw GPS (written by tracking API, used by geofence detection)
├── snapped_lat / snapped_lng    ← Corrected GPS (written by tracking API after OSRM call)
└── van_location_pings           ← Immutable raw audit trail (1:many, never modified)
```

## Data Flow

### Write Path (Tracking Ingestion)

1. GPS payload arrives at `POST /api/tracking/[vanId]`
2. Raw coordinates inserted into `van_location_pings` (unchanged)
3. **NEW**: Query last 4 pings from `van_location_pings` for trajectory context
4. **NEW**: Call OSRM `/match` with 5 coordinates (4 recent + current)
5. If OSRM returns a match: `UPDATE vans SET snapped_lat = ?, snapped_lng = ?, last_lat = ?, last_lng = ?`
6. If OSRM fails or no match: `UPDATE vans SET snapped_lat = NULL, snapped_lng = NULL, last_lat = ?, last_lng = ?`
7. `inferStopProgress` continues using `last_lat`/`last_lng` (raw GPS) — unchanged

### Read Path (Route Detail API)

1. Query `vans` table (existing query, add `snapped_lat`, `snapped_lng` to SELECT)
2. Serve to consumers: `lastLat = snapped_lat ?? last_lat`, `lastLng = snapped_lng ?? last_lng`
3. Map component and ETA computation receive corrected positions automatically

## Column Usage Matrix

| Consumer | Uses `last_lat`/`last_lng` (raw) | Uses `snapped_lat`/`snapped_lng` (corrected) |
|----------|:-:|:-:|
| `van_location_pings` INSERT | N/A (separate raw insert) | N/A |
| `inferStopProgress` (geofence) | Yes | No — raw GPS avoids snapping-induced false positives |
| Route detail API (`lastLat`/`lastLng` response) | Fallback | Primary (when available) |
| ETA computation | Fallback | Primary (when available) |
| Map van marker | Fallback | Primary (when available) |

## Validation Rules

- `snapped_lat`: Must be between -90 and 90 (same as `last_lat`), or `NULL`
- `snapped_lng`: Must be between -180 and 180 (same as `last_lng`), or `NULL`
- Both columns must be `NULL` together or populated together (application-level invariant, not enforced by DB constraint — simplicity per KISS)
- Snapped values should be within ~50m of raw values (sanity check in application code, not DB)

## Type Updates

### `Van` type in `src/types/index.ts`

Add two fields:
```typescript
export type Van = {
  // ... existing fields ...
  snapped_lat: number | null;
  snapped_lng: number | null;
};
```

### `VanPosition` interface in `src/lib/tracking/eta.ts`

No change needed — `VanPosition` already uses `lat`/`lng` generically. The route detail API will populate these with `snapped_lat ?? last_lat` before passing to ETA.
