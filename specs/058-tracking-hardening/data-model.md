# Data Model: Tracking System Hardening

## Schema Changes

### Migration: `00014_add_snapped_coords_to_van_location_pings.sql`

Add per-ping snapped coordinates to `van_location_pings`:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `snapped_lat` | double precision | yes | Road-snapped latitude from OSRM match |
| `snapped_lng` | double precision | yes | Road-snapped longitude from OSRM match |

These columns already exist on the `vans` table (migration 00005). This migration adds them to individual pings to support source-aligned confidence scoring.

**No index needed** — these columns are only read as part of the existing evidence query which filters by `van_id` + `device_ts` (already indexed).

## Type Changes

### `RouteProgress` (src/types/index.ts)

Add field:

| Field | Type | Description |
|-------|------|-------------|
| `runHealth` | `"normal" \| "orphaned"` | Health indicator for the route run |

### `VanPosition` (src/lib/tracking/eta.ts)

Extend with both coordinate sources:

| Field | Type | Description |
|-------|------|-------------|
| `lat` | number | Primary position latitude (raw, for backward compat) |
| `lng` | number | Primary position longitude (raw, for backward compat) |
| `snappedLat` | number \| null | Road-snapped latitude |
| `snappedLng` | number \| null | Road-snapped longitude |
| `speedMps` | number | Current speed |
| `lastGpsFixAt` | DateTime | Timestamp of last GPS fix |
| `headingDeg` | number \| null | Heading in degrees |

### `inferStopProgress` Input Object

New object argument replacing positional params:

| Field | Type | Description |
|-------|------|-------------|
| `supabase` | SupabaseClient | Supabase client |
| `vanId` | string | Van identifier |
| `rawLat` | number | Raw GPS latitude |
| `rawLng` | number | Raw GPS longitude |
| `snappedLat` | number \| null | Road-snapped latitude |
| `snappedLng` | number \| null | Road-snapped longitude |
| `eventTs` | string | ISO timestamp from device |

## Entity State Transitions

### Route Run Stop

```
pending ──[geofence match + contiguous + confidence gate]──> passed
passed  ──[canonical write detects non-contiguous]──────────> pending (healed)
```

Key invariant: Only a contiguous prefix from route start may have status = "passed" in storage.

### Route Run Health (read-path only, not persisted)

```
normal    ──[schedule overdue 90min + inactive 30min]──> orphaned (read-path indicator)
orphaned  ──[reconciliation job closes shift]──────────> (shift ended, run completed)
```

## New Modules

### `src/lib/tracking/effective-position.ts`

Pure function, no DB dependency:

```
chooseEffectivePosition(args) → { lat, lng, source: "raw" | "snapped" }
```

### `src/lib/tracking/orphaned-shift-health.ts`

Pure function, no DB dependency:

```
isOrphanedShift(args) → boolean
```

Shared thresholds: `SCHEDULE_OVERDUE_MINUTES = 90`, `INACTIVITY_MINUTES = 30`.

### `osrm.ts` — New Function

```
matchTrajectory(coords, osrmBaseUrl) → Array<{ lat, lng } | null> | null
```

Returns per-point snapped coordinates from OSRM /match response.
