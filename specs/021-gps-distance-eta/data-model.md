# Data Model: GPS-Distance-Based ETA

**Feature**: 021-gps-distance-eta | **Date**: 2026-03-02

## Overview

No new database tables or columns are needed. This feature consumes existing columns that are already stored but not yet used by the ETA computation.

## Existing Entities (consumed by this feature)

### Van (table: `vans`)

| Field | Type | Source | Used By |
|-------|------|--------|---------|
| `last_lat` | `double precision` | GPS ingestion | GPS ETA (van position) |
| `last_lng` | `double precision` | GPS ingestion | GPS ETA (van position) |
| `last_speed_mps` | `double precision` | GPS ingestion | GPS ETA (speed for travel time) |
| `location_updated_at` | `timestamptz` | GPS ingestion | GPS ETA (freshness check) |

### ScheduleEntry (table: `schedule_entries`)

| Field | Type | Source | Used By |
|-------|------|--------|---------|
| `stop_lat` | `double precision` | Admin config | GPS ETA (stop position) |
| `stop_lng` | `double precision` | Admin config | GPS ETA (stop position) |

## Modified Application Types

### Stop (in `src/lib/tracking/eta.ts`)

Added fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stopLat` | `number \| null` | Optional | Stop latitude from schedule_entries |
| `stopLng` | `number \| null` | Optional | Stop longitude from schedule_entries |

### VanPosition (new interface in `src/lib/tracking/eta.ts`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | `number` | Yes | Van's current latitude |
| `lng` | `number` | Yes | Van's current longitude |
| `speedMps` | `number` | Yes | Van's current speed in m/s |
| `locationUpdatedAt` | `DateTime` | Yes | When the position was last updated |

### EtaResult (in `src/lib/tracking/eta.ts`)

Added field:

| Field | Type | Description |
|-------|------|-------------|
| `etaSource` | `"gps" \| "schedule" \| null` | Which method computed the ETA |

### RouteProgress (in `src/types/index.ts`)

Added field:

| Field | Type | Description |
|-------|------|-------------|
| `etaSource` | `"gps" \| "schedule" \| null` | Propagated from EtaResult |

## Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `ROAD_FACTOR` | `1.3` | `src/lib/tracking/eta.ts` (new) | Haversine-to-road distance multiplier |
| `MIN_SPEED_MPS` | `1.0` | `src/lib/tracking/eta.ts` (new) | Below this, van is "stopped" → schedule fallback |
| `STALENESS_THRESHOLD_MINUTES` | `10` | `src/lib/time.ts` (existing, reused) | GPS older than this → schedule fallback |

## Validation Rules

- GPS ETA requires **all four** conditions: `vanPosition` exists, `nextStop` has both `stopLat` and `stopLng`, `speedMps >= MIN_SPEED_MPS`, and position age < `STALENESS_THRESHOLD_MINUTES`.
- If any condition fails, the system uses the existing schedule-delay path.
- No database-level validation changes needed.
