# Feature Specification: Gate Stop-Progress Inference by Active Shift

**Feature Branch**: `048-gate-stop-inference`
**Created**: 2026-03-07
**Status**: Draft
**Input**: Finding #3 from tracking system audit — stop-progress inference runs on every GPS ping with no check for an active driver shift, causing premature stop marking.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prevent pre-shift stop marking (Priority: P1)

As a transit operations manager, I need stop-progress inference to only mark stops as "passed" when a driver has an active shift, so that the progress bar and ETA reflect actual service — not phantom GPS proximity from parked or idle vans.

**Why this priority**: This is the core problem. Without this gate, stops get marked before a driver starts their shift, causing incorrect progress for riders and operators.

**Independent Test**: Can be tested by sending GPS pings near a stop without starting a shift — no stops should be marked as "passed."

**Acceptance Scenarios**:

1. **Given** a van is parked near stop 1 overnight with no active shift, **When** GPS pings arrive, **Then** no `route_run_stops` are marked as "passed" and no `route_run_stops` are seeded.
2. **Given** a driver starts their shift, **When** GPS pings arrive near a stop within the geofence, **Then** the stop is marked as "passed" (existing behavior preserved).
3. **Given** a driver has ended their shift, **When** GPS pings continue arriving near stops, **Then** no further stops are marked as "passed."

---

### User Story 2 - Correct progress on shift start (Priority: P2)

As a rider checking the app, I need the progress bar to accurately reflect which stops the van has actually served since the driver started, so that my arrival estimate is reliable.

**Why this priority**: Even with the shift gate, the transition from "no shift" to "active shift" must produce correct progress — not an instant jump to stops that were merely GPS-proximate before the shift.

**Independent Test**: Start a shift, send pings near stop 3 — progress should show stop 3 as passed and earlier stops backfilled, with no pre-shift phantom passes.

**Acceptance Scenarios**:

1. **Given** a van was near stop 1 before the shift started (no stops marked), **When** the driver starts the shift and a ping arrives near stop 3, **Then** stop 3 and earlier stops are marked as "passed" via backfill — but only from pings received after the shift started.
2. **Given** no shift is active, **When** the rider views the route, **Then** the progress bar shows zero stops passed (schedule-based fallback applies).

---

### Edge Cases

- **Van parked at a stop location overnight**: Pings arrive but no shift is active — system must not seed or mark any stops.
- **Pre-shift device testing**: Driver tests tracker near a stop — system must not mark stops.
- **Midnight buffer flush**: Batch of pings arrives after midnight for a new calendar day — system must not auto-create route_run_stops for the new day without a shift.
- **Multiple shifts per day**: If a driver ends a shift and starts a new one, stop inference should resume with the new active shift.
- **Overnight routes crossing midnight**: A shift that started before midnight should remain active (ended_at is still NULL) — stop inference should continue.
- **Route run auto-creation**: The `route_run` record itself can still be auto-created (it's just a container) — only stop seeding and marking require an active shift.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST check for an active shift (a `route_shifts` record with `ended_at IS NULL` for the current `route_run`) before seeding `route_run_stops` or marking any stops as "passed."
- **FR-002**: System MUST return an empty progress result (no passed stops, no next stop) when no active shift exists for the current route run.
- **FR-003**: System MUST continue to auto-create the `route_run` record via upsert (this is harmless and needed for shift creation to reference a run).
- **FR-004**: System MUST preserve all existing stop-marking behavior (geofence check, early arrival window, closest-in-time matching, chronological backfill) when an active shift is present.
- **FR-005**: System MUST treat a shift as active if at least one `route_shifts` record exists for the run with `ended_at IS NULL`.

### Key Entities

- **Route Run**: Daily instance of a route (one per route per service date). Container for shifts and stop progress.
- **Route Shift**: Driver's active work period within a route run. Has `started_at` (NOT NULL) and `ended_at` (NULL while active).
- **Route Run Stop**: Per-stop progress record within a route run. Status is "pending" or "passed" with optional `passed_at` timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero stops are marked as "passed" when no driver shift is active, regardless of van GPS proximity to stops.
- **SC-002**: When a shift is active, 100% of existing stop-marking behavior is preserved (no regressions in geofence detection, backfill, or closest-in-time matching).
- **SC-003**: No `route_run_stops` records are seeded for a route run until a shift is started for that run.
- **SC-004**: The fix adds no more than 1 additional query per GPS ping processing cycle (the shift existence check).

## Assumptions

- The `route_shifts` table already exists with the correct schema (`run_id`, `started_at`, `ended_at`).
- The start/end shift API endpoints (`POST /api/routes/[routeId]/start` and `/end`) already manage `route_shifts` correctly.
- The `isRunning` gate in the consumer API provides partial UI protection today, but the underlying data mutation (stops marked as "passed") is the real problem this fix addresses.
- The `route_run` auto-creation via upsert remains unchanged — it's needed as a container for shifts and is harmless on its own.

## Scope Boundaries

**In scope:**
- Adding a shift-existence check to `inferStopProgress()` before stop seeding and marking.

**Out of scope:**
- Changes to the start/end shift API endpoints.
- Changes to the consumer API (`GET /api/routes/[routeId]`).
- Schema or migration changes (none needed).
- Retroactive cleanup of already-marked stops from pre-shift pings.
