# Data Model: Schedule Time Split

**Feature**: 063-schedule-time-split
**Date**: 2026-03-11

## Entity Changes

### schedule_entries (modified)

**New columns**:

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `stop_sequence` | `integer` | NOT NULL | Trigger: `MAX(stop_sequence) + 1` per route | Explicit ordering independent of clock values |
| `arrival_time` | `time` | NOT NULL | Trigger: copies from `time` if NULL | When the van arrives at this stop |
| `departure_time` | `time` | NOT NULL | Trigger: copies from `time` if NULL | When the van departs this stop |

**Modified constraints**:

| Constraint | Before | After |
|-----------|--------|-------|
| Unique | `(route_id, time)` | `(route_id, stop_sequence)` |
| Index | `idx_schedule_entries_route_time` | `idx_schedule_entries_route_sequence` |
| Check | — | `chk_departure_gte_arrival: departure_time >= arrival_time` |

**Column lifecycle**:

| Phase | `time` | `arrival_time` | `departure_time` | `stop_sequence` |
|-------|--------|----------------|-------------------|-----------------|
| 1 (migration) | EXISTS, writable | Added, trigger-synced | Added, trigger-synced | Added, trigger-auto |
| 2 (reorder) | EXISTS, writable | Exists | Exists | Used for ordering |
| 3 (adopt) | EXISTS, trigger-only | Primary write target | Primary write target | Primary write target |
| 4 (cleanup) | DROPPED | Primary | Primary | Primary |

**Boundary semantics**:

| Stop type | `arrival_time` | `departure_time` |
|-----------|---------------|-------------------|
| Origin (first) | When van should be at starting point | When van departs |
| Intermediate | When van arrives | When van departs (often = arrival) |
| Pass-through | Same as departure | Same as arrival |
| Terminal (last) | Scheduled arrival | Equals arrival (no dwell) |

### route_run_stops (unchanged)

No schema changes. The `schedule_entry_id` FK still references `schedule_entries.id`. The seeding logic (`seed-route-run-stops.ts`) reads from new fields at seed time but the `route_run_stops` table itself is unmodified.

## TypeScript Type Changes

### ScheduleEntry

```
Before: { id, route_id, stop_name, time, stop_lat, stop_lng, geofence_radius_m, stop_group_id, created_at }
After:  { id, route_id, stop_name, arrival_time, departure_time, stop_sequence, stop_lat, stop_lng, geofence_radius_m, stop_group_id, created_at }
```

### NextStop

```
Before: { stopName, time, id }
After:  { stopName, arrivalTime, departureTime, id }
```

### RouteDetail.schedule[]

```
Before: { id, stopName, time, stopLat, stopLng }
After:  { id, stopName, arrivalTime, departureTime, stopSequence, stopLat, stopLng }
```

### TimelineStop

```
Before: { id, stopName, time, status }
After:  { id, stopName, arrivalTime, departureTime, status }
```

## Validation Rules

### Create schedule entry

| Field | Rule |
|-------|------|
| `arrivalTime` | Required. HH:mm format (regex `^([01]\d\|2[0-3]):[0-5]\d$`) |
| `departureTime` | Required. HH:mm format (same regex) |
| Cross-field | `departureTime >= arrivalTime` (Zod `.refine()`) |
| `stopName` | Required. 1-200 chars |
| `stopLat` | Optional nullable. Range [-90, 90] |
| `stopLng` | Optional nullable. Range [-180, 180] |
| `stopGroupId` | Optional nullable. Max 100 chars |

### Update schedule entry

Same rules as create.

### Reorder stops

| Field | Rule |
|-------|------|
| `entryIds` | Required. Array of UUID strings. Must contain all entry IDs for the route (no partial reorder). |

## State Transitions

No new state machines. The existing `route_run_stops` status (`pending` → `passed`) is unchanged.

The `schedule_entries` table does not have a status field — entries are static schedule definitions, not runtime state.
