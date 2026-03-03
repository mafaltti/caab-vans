# Feature Specification: Fix Stop Progress Backfill

**Feature Branch**: `031-fix-stop-backfill`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "Fix stop progress backfill logic — closest-in-time geofence matching + chronological backfill of earlier stops"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Stop Progress When Tracking Starts Late (Priority: P1)

A van driver starts GPS tracking mid-route (e.g., at stop 10 of 20). The system should recognize that all earlier stops (1-9) have already been passed and mark them accordingly. Passengers viewing the route should see an accurate timeline showing all prior stops as passed, with the correct next upcoming stop highlighted.

**Why this priority**: Without this, the most common real-world scenario (driver forgets to start tracking, GPS was off, app restart) results in a misleading timeline where early stops appear as "not reached" even though the van is far ahead.

**Independent Test**: Can be fully tested by simulating a GPS ping at a mid-route stop and verifying that all chronologically earlier stops are marked as passed.

**Acceptance Scenarios**:

1. **Given** a route with 15 stops (07:00 through 14:00) and no stops yet marked as passed, **When** the first GPS ping arrives at stop 10 (at 12:05, within geofence of the 12:00 stop), **Then** stops 1-10 are all marked as "passed" and stop 11 becomes the next stop.
2. **Given** a route with stops already partially passed (1-5 passed, 6-15 pending), **When** a GPS ping arrives at stop 12, **Then** stops 6-12 are additionally marked as "passed" and stop 13 becomes the next stop.
3. **Given** a route where the van is at stop 5, **When** a GPS ping arrives within stop 5's geofence, **Then** stops 1-4 are backfilled as "passed" even though the van never physically entered their geofences.

---

### User Story 2 - Correct Matching for Repeated Stops (Priority: P1)

A route visits the same physical location multiple times at different scheduled times (e.g., CAAB at 07:00 and CAAB at 11:00). When the van is at that location, the system should match the geofence hit to the correct occurrence based on the current time, not always the earliest one.

**Why this priority**: Routes commonly loop back through hub stops. Incorrect matching causes the wrong occurrence to be marked, leaving the correct one perpetually pending and breaking the timeline display.

**Independent Test**: Can be tested by simulating a GPS ping at a repeated-stop location at different times and verifying the correct occurrence is matched each time.

**Acceptance Scenarios**:

1. **Given** CAAB appears at 07:00 and 11:00, both pending, **When** a GPS ping arrives at CAAB at 11:05, **Then** the 11:00 occurrence is marked as "passed" (not the 07:00 one), and the 07:00 occurrence is also backfilled as "passed" (chronologically earlier).
2. **Given** CAAB appears at 07:00 and 11:00, both pending, **When** a GPS ping arrives at CAAB at 07:05, **Then** only the 07:00 occurrence is marked as "passed"; the 11:00 occurrence remains "pending".
3. **Given** CAAB at 07:00 is already passed, and CAAB at 11:00 is pending, **When** a GPS ping arrives at CAAB at 11:02, **Then** the 11:00 occurrence is marked as "passed".

---

### User Story 3 - Backfilled Stops Record Timestamp (Priority: P2)

When stops are backfilled (marked as passed without a direct geofence hit), each backfilled stop records when it was retroactively marked. This ensures data completeness for operational reporting.

**Why this priority**: Important for auditability and debugging, but does not affect the passenger-facing experience directly.

**Independent Test**: Can be tested by triggering a backfill and checking that all backfilled stops have a non-null passed_at timestamp.

**Acceptance Scenarios**:

1. **Given** stops 1-9 are pending and stop 10 is matched by geofence, **When** stops 1-9 are backfilled, **Then** each backfilled stop has a `passed_at` timestamp set to the time of the backfill (not their scheduled time).

---

### Edge Cases

- **First stop of the day**: Van's first ping is within geofence of stop 1. No backfill needed — only stop 1 is marked as passed. System behaves identically to current behavior.
- **Van at last stop**: GPS ping at the final stop should mark all remaining pending stops (including the last one) as passed. No "next stop" should be returned.
- **Three occurrences of the same stop**: Route has CAAB at 07:00, 11:00, and 15:00. At 11:10, the 11:00 occurrence is matched (closest to now). Both 07:00 and 11:00 are marked as passed. The 15:00 occurrence remains pending.
- **GPS ping between two stops**: Van is not within any stop's geofence. No geofence match occurs, no backfill is triggered. Existing behavior is preserved.
- **No pending stops**: All stops already passed. System returns the existing state with no modifications.
- **Early arrival window still applies**: A stop scheduled at 14:00 is not eligible for geofence matching before 13:30 (30-minute early arrival window). This existing guard is preserved and interacts correctly with the closest-in-time matching.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When multiple pending stops share the same coordinates, the system MUST match a geofence hit to the pending stop whose scheduled time is closest to the current time (instead of the earliest pending occurrence).
- **FR-002**: After marking any stop as "passed" via geofence, the system MUST also mark all chronologically earlier pending stops as "passed" (backfill).
- **FR-003**: Backfilled stops MUST have their `passed_at` timestamp set to the current time at the moment of backfill.
- **FR-004**: The existing early arrival window (30 minutes) MUST continue to prevent matching stops whose scheduled time is more than 30 minutes in the future.
- **FR-005**: The system MUST NOT mark a later occurrence of a repeated stop as passed when only an earlier occurrence is being matched.
- **FR-006**: Backfill MUST use the schedule_entries `time` field for chronological ordering to determine which stops are "earlier" than the matched stop.

### Key Entities

- **route_run_stops**: Per-day instance of a scheduled stop within a route run. Has a `status` (pending/passed) and optional `passed_at` timestamp. Composite key of `(run_id, schedule_entry_id)`.
- **schedule_entries**: Fixed route template stop. Has a `time` (HH:mm), `stop_lat`, `stop_lng`, and `geofence_radius_m`. The same physical location can appear multiple times with different times.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a van's first GPS ping is at stop N, all N stops (including earlier ones never physically visited) are shown as "passed" in the passenger-facing timeline within the same processing cycle.
- **SC-002**: For routes with repeated stops, the correct occurrence is matched 100% of the time based on proximity to the current time.
- **SC-003**: Existing tests continue to pass; new tests cover the backfill and closest-in-time matching scenarios.
- **SC-004**: No additional API calls or user actions are required from the driver — backfill happens automatically during normal GPS ping processing.

## Assumptions

- Routes are fixed linear sequences; stops are ordered chronologically by their `time` field with no route loops that revisit a stop at an earlier scheduled time.
- The `time` field in schedule_entries is sufficient for determining chronological order (no need for a separate `sequence` or `order` column).
- Backfilling earlier stops is always correct — there is no scenario where an earlier stop should remain "pending" when a later stop is confirmed as "passed".
