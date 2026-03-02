# Data Model: Fix ETA & Next Stop Time-Awareness

**Feature**: 019-fix-eta-next-stop
**Date**: 2026-03-01

## No Schema Changes

This bug fix does not modify any database tables, columns, or constraints. All changes are in application-layer logic.

## Existing Entities (Reference)

### route_run_stops

The core entity involved in the bug. Each row tracks whether a van has passed a specific scheduled stop on a given day.

| Field | Type | Notes |
|-------|------|-------|
| run_id | UUID | FK to route_runs |
| schedule_entry_id | UUID | FK to schedule_entries |
| status | text | `"pending"` or `"passed"` — **no changes** |
| passed_at | timestamptz | Set when van geofences the stop |

**Key behavior change**: Rows with `status = "pending"` whose associated `schedule_entries.time` is before the current time will now be filtered out when selecting the "next stop" in `computeEta` and `inferStopProgress`. The DB rows themselves are not modified.

### schedule_entries

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| route_id | UUID | FK to routes |
| time | text | `"HH:mm"` format, sorted chronologically |
| stop_name | text | Display name |
| stop_lat / stop_lng | float | Coordinates for geofencing |
| geofence_radius_m | int | Geofence radius |

## State Transitions

No changes to state transitions. The `pending → passed` transition still only occurs via GPS geofencing in `inferStopProgress`. The fix adds a read-time filter, not a write-time mutation.
