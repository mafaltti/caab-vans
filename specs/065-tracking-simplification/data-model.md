# Data Model: Tracking Simplification

**Feature**: 065-tracking-simplification
**Date**: 2026-03-11

## Schema Changes

**No schema migrations required.** All changes are behavioral — existing tables and columns are sufficient.

## Affected Entities

### route_run_stops

| Column | Type | Change |
|--------|------|--------|
| status | text ("pending" \| "passed") | No schema change. Behavioral: only written by device geofence and manual confirm (not GPS inference). |
| pass_source | text | No schema change. New writes use only `device_geofence` or `manual`. Historical values `geofence_raw`, `geofence_snapped`, `backfill` remain in old data. |
| pass_confidence | numeric [0.0–1.0] | No schema change. |
| passed_at | timestamptz | No schema change. |

**Lifecycle (unchanged)**:
```
pending → passed  (via device geofence or manual confirm)
passed → pending  (via canonical prefix healing only)
```

**Writer constraints (NEW behavioral rule)**:

| Writer | pass_source | Allowed? |
|--------|-------------|----------|
| Device geofence processing | `device_geofence` | Yes |
| Manual confirmation | `manual` | Yes |
| GPS inference (`inferStopProgress`) | `geofence_raw`, `geofence_snapped`, `backfill` | **No** (callers removed) |
| Canonical healing | `null` (revert to pending) | Yes (self-heal only) |

### route_runs

| Column | Type | Change |
|--------|------|--------|
| last_passed_stop_id | uuid (nullable) | No schema change. Now written by shared helper called from device geofence, manual confirm, and shift start. |
| next_stop_id | uuid (nullable) | No schema change. Initialized at shift start (was NULL until first geofence/confirm). |
| progress_updated_at | timestamptz (nullable) | No schema change. |

**Pointer writers (post-simplification)**:

| Event | Writes pointers? |
|-------|-----------------|
| Shift start | Yes — sets `next_stop_id` to first pending stop |
| Device geofence marks stop passed | Yes — via shared helper |
| Manual confirm marks stops passed | Yes — via shared helper (already does this) |
| GPS ping ingestion | **No** (inference removed) |
| Progress resolver self-heal | Yes — repairs invalid pointer once |

### tracking_geofence_events

| Column | Type | Change |
|--------|------|--------|
| status | text ("received" \| "matched" \| "no_match") | No schema change. |

**No behavioral changes to this table.** Event lifecycle unchanged.

### van_location_pings

**No changes.** GPS pings continue to be stored. The only behavioral change is that ping ingestion no longer calls `inferStopProgress()`.

### schedule_entries

| Column | Type | Change |
|--------|------|--------|
| device_geofence_radius_m | integer (nullable) | No schema change. Behavioral: tracker config endpoint now aggregates across grouped entries with clamping. |

## New Shared Helper

### `persistCanonicalProgress(supabase, runId)`

**Not a data model change** — a code-level helper that encapsulates an existing pattern.

**Reads**: `route_run_stops` (schedule_entry_id, status) joined with `schedule_entries` (stop_sequence)
**Writes**: `route_run_stops` (heal non-contiguous to pending), `route_runs` (pointers)

**Invariant maintained**: After every call, `route_runs.next_stop_id` points to the first pending stop in the contiguous prefix, and `route_runs.last_passed_stop_id` points to the last contiguous passed stop.
