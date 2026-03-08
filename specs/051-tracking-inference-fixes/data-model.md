# Data Model: Tracking Inference Fixes

**Date**: 2026-03-07
**Feature**: 051-tracking-inference-fixes

## Schema Changes

Three additive migrations. All add nullable columns to existing tables, preserving full backward compatibility. The latest existing migration is `00010_drop_seq_column.sql`.

---

### Migration 00011: Stop Confidence Metadata

**File**: `supabase/migrations/00011_stop_confidence_metadata.sql`
**Table**: `route_run_stops` (PK: `run_id + schedule_entry_id`)

| Column | Type | Nullable | Constraint | Purpose |
|--------|------|----------|------------|---------|
| `pass_source` | TEXT | YES | `CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual'))` | How the stop was marked as passed |
| `pass_confidence` | NUMERIC | YES | `CHECK (pass_confidence >= 0.0 AND pass_confidence <= 1.0)` | Confidence score (0.0-1.0) |

```sql
ALTER TABLE route_run_stops
  ADD COLUMN pass_source text
    CHECK (pass_source IN ('geofence_raw', 'geofence_snapped', 'backfill', 'manual')),
  ADD COLUMN pass_confidence numeric
    CHECK (pass_confidence >= 0.0 AND pass_confidence <= 1.0);
```

**Indexes**: None required. Write-heavy, read-rarely (admin diagnostics only).

---

### Migration 00012: Stop Group ID

**File**: `supabase/migrations/00012_stop_group_id.sql`
**Table**: `schedule_entries` (PK: `id`)

| Column | Type | Nullable | Constraint | Purpose |
|--------|------|----------|------------|---------|
| `stop_group_id` | TEXT | YES | None | Logical grouping for repeated physical stops |

```sql
ALTER TABLE schedule_entries
  ADD COLUMN stop_group_id text;
```

**Indexes**: None. Schedule entries per route are small (~20), grouping is in-memory.

**Notes**: Value is an opaque admin-assigned string (e.g., `"escola-central"`). No foreign key. When NULL, inference falls back to coordinate-based grouping.

---

### Migration 00013: Persist Progress Pointers

**File**: `supabase/migrations/00013_persist_progress_pointers.sql`
**Table**: `route_runs` (PK: `id`, unique: `route_id + service_date`)

| Column | Type | Nullable | Constraint | Purpose |
|--------|------|----------|------------|---------|
| `last_passed_stop_id` | UUID | YES | `REFERENCES schedule_entries(id) ON DELETE SET NULL` | Most recently passed schedule entry |
| `next_stop_id` | UUID | YES | `REFERENCES schedule_entries(id) ON DELETE SET NULL` | Next expected schedule entry |
| `progress_updated_at` | TIMESTAMPTZ | YES | None | Timestamp of last progress update |

```sql
ALTER TABLE route_runs
  ADD COLUMN last_passed_stop_id uuid
    REFERENCES schedule_entries(id) ON DELETE SET NULL,
  ADD COLUMN next_stop_id uuid
    REFERENCES schedule_entries(id) ON DELETE SET NULL,
  ADD COLUMN progress_updated_at timestamptz;
```

**Foreign key behavior**: `ON DELETE SET NULL` — if a schedule entry is deleted, pointers gracefully become NULL and trigger recomputation on next request.

**Indexes**: None additional. `route_runs` is queried by `(route_id, service_date)` which already has a unique constraint/index.

---

## Computed Types (BFF only, not stored)

### TrackingStatus

```typescript
export type TrackingStatus = 'live' | 'stale' | 'missing';
```

| Condition | Value | Meaning |
|-----------|-------|---------|
| `last_gps_fix_at` not null AND age < 10 min | `'live'` | GPS data fresh and reliable |
| `last_gps_fix_at` not null AND age 10-60 min | `'stale'` | GPS data exists but outdated |
| `last_gps_fix_at` null OR age >= 60 min | `'missing'` | No usable GPS data |

Constants:
```typescript
export const TRACKING_LIVE_THRESHOLD_MINUTES = 10;
export const TRACKING_STALE_THRESHOLD_MINUTES = 60;
```

### PassSource

```typescript
export type PassSource = 'geofence_raw' | 'geofence_snapped' | 'backfill' | 'manual';
```

---

## State Transitions

### pass_source and confidence mapping

| Inference Path | pass_source | Typical Confidence |
|----------------|-------------|-------------------|
| Van enters geofence, raw GPS used (snap displacement > 50m) | `geofence_raw` | 0.7 - 1.0 |
| Van enters geofence, snapped pos used (snap displacement <= 50m) | `geofence_snapped` | 0.8 - 1.0 |
| Earlier stops marked retroactively | `backfill` | 0.3 - 0.7 |
| Admin manually marks a stop | `manual` | 1.0 |

### Confidence scoring

| Scenario | Confidence |
|----------|------------|
| 2+ pings in 5-min window in geofence, snapped | 1.0 |
| 2+ pings in 5-min window in geofence, raw | 0.9 |
| Single ping in geofence, snapped | 0.8 |
| Single ping in geofence, raw | 0.7 |
| Backfill: 1-stop gap | 0.7 |
| Backfill: 2-3 stop gap with time evidence | 0.5 |
| Backfill: 4+ stop gap | 0.3 |
| Manual admin override | 1.0 |

### Stop status lifecycle

Status remains `pending` -> `passed` (one-way, irreversible). `pass_source` and `pass_confidence` are metadata set at transition time. No new status values (FR-012).

---

## Stop Grouping Logic

```
IF stop_group_id IS NOT NULL
  → group key = stop_group_id
ELSE
  → group key = "${stop_lat.toFixed(6)},${stop_lng.toFixed(6)}"
    (current behavior, preserved as fallback)
```

Within a group, closest-in-time occurrence selection is unchanged.

---

## Backward Compatibility

| Change | Impact on Existing Queries | Mitigation |
|--------|---------------------------|------------|
| `pass_source`/`pass_confidence` on `route_run_stops` | None. Existing inserts omit these (NULL). | Columns nullable; old rows have NULL. |
| `stop_group_id` on `schedule_entries` | None. Not referenced by existing queries. | Inference falls back to coordinates when NULL. |
| Progress pointers on `route_runs` | None. Not referenced by existing queries. | API falls back to recomputation if NULL. |
| `TrackingStatus` in API response | Additive JSON field. Clients ignore unknowns. | `isRunning` and `isLocationOutdated` preserved. |

**Migration safety**: All `ALTER TABLE ... ADD COLUMN` with nullable defaults. PostgreSQL adds these without table rewrites. Safe to run on live database. Each migration independently reversible with `DROP COLUMN`.
