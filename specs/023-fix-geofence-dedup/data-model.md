# Data Model: Fix Geofence Duplicate Stop Passing

**Feature**: `023-fix-geofence-dedup`
**Date**: 2026-03-02

## Schema Changes

**No database schema changes required.** This is a behavioral fix to the application logic only.

## Existing Entities (Unchanged)

### schedule_entries

| Field             | Type             | Notes                         |
|-------------------|------------------|-------------------------------|
| id                | uuid (PK)        |                               |
| route_id          | uuid (FK)        |                               |
| stop_name         | text             |                               |
| time              | time             | HH:mm:ss                      |
| stop_lat          | double precision | Nullable                      |
| stop_lng          | double precision | Nullable                      |
| geofence_radius_m | integer          | Default 50                    |

**Key constraint**: `UNIQUE (route_id, time)` — a route cannot have two entries at the exact same time. However, the same `stop_lat`/`stop_lng` pair CAN appear at multiple times (this is the repeated-stop scenario).

### route_run_stops

| Field              | Type        | Notes                              |
|--------------------|-------------|------------------------------------|
| run_id             | uuid (PK)   | FK to route_runs                   |
| schedule_entry_id  | uuid (PK)   | FK to schedule_entries             |
| status             | text        | `'pending'` or `'passed'`          |
| passed_at          | timestamptz | Set when status changes to passed  |

**State transitions**: `pending` → `passed` (one-way, set by `inferStopProgress`)

## Behavioral Change

### Before (Bug)

When van is within geofence of a location:
- ALL pending `route_run_stops` with matching coordinates are updated to `passed`

### After (Fix)

When van is within geofence of a location:
- Only the FIRST pending `route_run_stop` (by schedule time order) with matching coordinates is updated to `passed`
- The stop's scheduled time must be within 30 minutes of the current time (not too far in the future)

## New Constant

| Name                          | Value | Location            |
|-------------------------------|-------|---------------------|
| EARLY_ARRIVAL_WINDOW_MINUTES  | 30    | `src/lib/time.ts`   |
