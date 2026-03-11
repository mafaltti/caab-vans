# Research: Schedule Time Split

**Feature**: 063-schedule-time-split
**Date**: 2026-03-11

## R1: Current Database Schema

**Decision**: New migration `00016_schedule_time_split.sql` adds three columns to `schedule_entries`.

**Current schema** (as of migration 00015):
- `id` uuid PK
- `route_id` uuid FK → routes(id) CASCADE
- `stop_name` text NOT NULL
- `time` time NOT NULL
- `stop_lat` double precision
- `stop_lng` double precision
- `geofence_radius_m` integer NOT NULL DEFAULT 50
- `osrm_distance_m` double precision
- `stop_group_id` text
- `device_geofence_radius_m` integer
- `updated_at` timestamptz NOT NULL DEFAULT now()
- `created_at` timestamptz NOT NULL DEFAULT now()

**Existing constraints**:
- UNIQUE `(route_id, time)`
- Index: `idx_schedule_entries_route_time ON (route_id, time)`
- Trigger: `trg_schedule_entries_updated_at` (auto-updates `updated_at`)

**Rationale**: Adding columns with backfill + dual-write trigger is the safest migration pattern for zero-downtime. Migration numbering follows existing `NNNNN_description.sql` convention.

## R2: Current Type Definitions

**Decision**: Four types need `time` → `arrivalTime` + `departureTime` + `stopSequence` migration.

| Type | Current `time` field | Location |
|------|---------------------|----------|
| `ScheduleEntry` | `time: string` | `src/types/index.ts` |
| `NextStop` | `time: string` | `src/types/index.ts` |
| `RouteDetail.schedule[]` | `time: string` | `src/types/index.ts` |
| `TimelineStop` | `time: string` | `src/types/index.ts` |

**Rationale**: All types use `time` as a plain HH:mm string. The refactor adds `arrivalTime`, `departureTime` (both HH:mm strings), and `stopSequence` (number). The `time` field is removed after Phase 4.

## R3: Current Validators

**Decision**: Zod schemas replace `time` with `arrivalTime` + `departureTime` + `.refine()`.

**Current** (`src/lib/validators/schedule-entry.ts`):
```
createScheduleEntrySchema: { stopName, time (HH:mm regex), stopLat?, stopLng?, stopGroupId? }
updateScheduleEntrySchema: identical to create
```

**After**: Both schemas get `arrivalTime` + `departureTime` (same HH:mm regex) + `.refine(d => d.departureTime >= d.arrivalTime)`.

## R4: Tracking Core Time Usage Classification

**Decision**: Each `time` reference maps to exactly one of the new fields per the semantic mapping.

| Classification | Count | Maps to |
|---------------|-------|---------|
| SORT | 18 | `stopSequence` |
| ARRIVAL_SEMANTIC | 15 | `arrivalTime` |
| DEPARTURE_SEMANTIC | 20 | `departureTime` |
| IDENTITY | 10 | Type updates only |

**Files by risk (reference count)**:
1. `eta.ts` — 15 refs (4 SORT, 7 ARRIVAL, 2 DEPARTURE, 2 IDENTITY)
2. `infer-stop-progress.ts` — 10 refs (6 SORT, 2 ARRIVAL, 2 DEPARTURE)
3. `process-device-geofence-events.ts` — 5 refs (2 SORT, 1 ARRIVAL, 2 DEPARTURE)
4. `resolve-route-progress.ts` — 6 refs (2 SORT, 1 ARRIVAL, 1 DEPARTURE, 2 IDENTITY)
5. `suggest-start-stop.ts` — 9 refs (3 SORT, 0 ARRIVAL, 4 DEPARTURE, 2 IDENTITY)
6. `time.ts` — 6 refs (2 SORT, 0 ARRIVAL, 4 DEPARTURE)

## R5: API Response Shapes

**Decision**: All API responses add `arrivalTime`, `departureTime`, `stopSequence`; drop `time` in Phase 4.

**Current response shapes**:

| Endpoint | Schedule fields |
|----------|----------------|
| `GET /api/routes` | `{ stopName, time }` per entry |
| `GET /api/routes/:id` | `{ id, stopName, time, stopLat, stopLng }` per entry |
| `GET /api/admin/routes/:id/schedule` | `{ id, stopName, time, stopLat, stopLng, stopGroupId }` per entry |
| `POST /admin/.../schedule` | Returns created entry with same shape |
| `PUT /admin/.../schedule/:entryId` | Returns updated entry with same shape |
| `NextStop` in route responses | `{ stopName, time, id }` |

**Field mapping**: `time` → `formatTimeString(e.time)` extracts first 5 chars of DB time value.

## R6: UI Component Time Usage

**Decision**: Components display HH:mm strings directly. No timezone conversion at UI layer.

| Component | Current usage | After refactor |
|-----------|-------------|---------------|
| `schedule-editor.tsx` | Single `<Input>` for `time`, sorts by `time.localeCompare` | Two inputs (arrival/departure), sort by `stopSequence` |
| `schedule-timeline.tsx` | Displays `stop.time`, compares `entry.time < serverTime` | Display arrival (or range if different), compare with `arrivalTime` |
| `hero-card.tsx` | `nextStop.time` beside ETA | `nextStop.arrivalTime` |
| `route-card.tsx` | `route.nextStop.time` | `route.nextStop.arrivalTime` |
| `driver/route-card.tsx` | `stop.time` in cold-start dialog | Both `arrivalTime` and `departureTime` when different |
| `route-detail-peek.tsx` | Receives `scheduledTime` prop | Parent passes `arrivalTime` instead |
| `page.tsx` (identity match) | `s.time === route.nextStop!.time` | Match by `s.id` directly (FR-010) |

## R7: Scripts Time Usage

**Decision**: Scripts update to use new fields; sorting switches to `stop_sequence`.

| Script | Current usage | After refactor |
|--------|-------------|---------------|
| `seed-schedule.ts` | Inserts `{ route_id, stop_name, time, stop_lat, stop_lng }` | Add `arrival_time`, `departure_time`, `stop_sequence` |
| `simulate-tracking.ts` | `.sort((a,b) => a.time.localeCompare(b.time))`, `toMinutes(entry.time)` | Sort by `stopSequence`, use `arrivalTime` for interpolation |
| `precompute-stop-distances.ts` | SQL `ORDER BY r.id, se.time` | `ORDER BY r.id, se.stop_sequence` |
| `reconcile-orphaned-shifts.ts` | `.map(e => e.time).sort().at(-1)` for max time | Use `arrivalTime` for max scheduled time |

## R8: Dual-Write Trigger Design

**Decision**: Bidirectional BEFORE INSERT OR UPDATE trigger synchronizes old and new fields.

**Rationale**: Allows phased rollout — legacy writers (admin CRUD, seed script) continue writing `time` only during Phase 1-2, while new writers adopt `arrival_time`/`departure_time` in Phase 3. Trigger fills whichever side is missing.

**Alternatives considered**:
- Application-level dual-write: Rejected — requires changing all writers simultaneously, no safety net.
- View-based abstraction: Rejected — adds complexity without clear benefit for this migration scope.
- Big-bang migration: Rejected — too risky for production; no rollback path.

## R9: Reorder Endpoint Design

**Decision**: `PATCH /api/admin/routes/:routeId/schedule/reorder` accepts ordered array of entry IDs.

**Rationale**: Required before switching to sequence-based ordering. Without it, new stops auto-append via `MAX(stop_sequence) + 1` and can't be repositioned. The endpoint bulk-updates `stop_sequence` values (1, 2, 3...) in a single operation.

**Alternatives considered**:
- Drag-and-drop only (no endpoint): Rejected — reordering must be persisted server-side.
- Per-entry PATCH with sequence number: Rejected — requires client to compute new sequence values; error-prone.
- Auto-sort by time with manual override: Rejected — defeats the purpose of decoupling order from clock values.
