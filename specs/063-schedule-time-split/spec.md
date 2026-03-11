# Feature Specification: Schedule Time Split (arrival + departure + sequence)

**Feature Branch**: `063-schedule-time-split`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Refactor `schedule_entries` from a single `time` field to separate `arrival_time`, `departure_time`, and `stop_sequence` columns. Based on analysis in `docs/execution/0107-schedule-entries-final-analysis.md`.

## Scope

This refactoring targets the `schedule_entries` table and all code that reads/writes it. Runtime execution records (`route_run_stops`) are **out of scope** — they track actual stop passage, not scheduled times. The only change to `route_run_stops`-related code is updating the seed logic to read from the new schedule fields. The tracker app is also out of scope; it posts GPS pings and does not interact with schedule data.

## Clarifications

### Session 2026-03-11

- Q: Does this refactoring also change route_run_stops, or is it strictly schedule_entries only? → A: schedule_entries only — route_run_stops just reads new fields at seed time, no schema change.
- Q: What time field(s) should the driver view display? → A: Both — arrival as reference, departure as "leave by" when they differ.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin manages arrival and departure times per stop (Priority: P1)

An admin editing a route's schedule can set separate arrival and departure times for each stop. For most intermediate stops, arrival and departure are the same. For the origin stop, the admin sets when the van should arrive at the starting point and when it departs. The admin sees two time inputs per stop row, and the schedule editor validates that departure is not before arrival.

**Why this priority**: This is the core data model change. Without separate arrival/departure times, all downstream features (ETA accuracy, schedule windows, delay computation) remain limited by the single-time ambiguity.

**Independent Test**: Can be fully tested by creating and editing schedule entries in the admin editor and verifying both times are persisted and displayed correctly.

**Acceptance Scenarios**:

1. **Given** an admin is editing a route schedule, **When** they add a new stop with arrival "07:00" and departure "07:05", **Then** both times are saved and displayed in the schedule editor.
2. **Given** an admin is editing a stop, **When** they set departure earlier than arrival, **Then** the system rejects the input with a validation error.
3. **Given** an existing schedule with only legacy single-time entries, **When** the admin opens the editor, **Then** both arrival and departure show the same value (backfilled from the legacy time).
4. **Given** an admin adds a new stop, **When** arrival equals departure, **Then** the entry is accepted (pass-through stop).

---

### User Story 2 - Admin reorders stops independently of time (Priority: P1)

An admin can reorder stops in a route's schedule without changing their times. Stops have an explicit ordering (sequence) that is independent of clock values. After adding a new stop, the admin can place it at the correct position in the route rather than having it auto-sort by time.

**Why this priority**: Without explicit ordering, the system derives stop order from clock values. This breaks when two stops have the same time, when routes loop, or when a stop is inserted between existing ones. Sequence-based ordering is a prerequisite for correct tracking behavior.

**Independent Test**: Can be tested by adding stops out of chronological order and verifying they appear in the admin-specified sequence, not sorted by time.

**Acceptance Scenarios**:

1. **Given** a route with stops at seq 1, 2, 3, **When** the admin reorders stop 3 to position 2, **Then** the stops reflect the new order (1, 3, 2 becomes 1, 2, 3 renumbered).
2. **Given** a newly added stop, **When** it is appended to the route, **Then** the admin can reorder it to the correct position.
3. **Given** the admin deletes stop 2 from a 4-stop route, **When** viewing the schedule, **Then** the remaining stops maintain their relative order (gaps in sequence numbers are acceptable).

---

### User Story 3 - Commuters see correct reference time beside ETA (Priority: P2)

Commuters viewing a route's live status see the scheduled arrival time displayed next to the ETA. Since ETA represents when the van will arrive, the reference time must also be the arrival time for consistency. When arrival and departure differ, the schedule timeline shows both as a range; when equal, it shows a single time.

**Why this priority**: This directly affects commuter experience. Currently the displayed "scheduled time" is ambiguous — it could mean arrival or departure. Showing arrival time beside ETA eliminates confusion.

**Independent Test**: Can be tested by viewing a route with stops that have different arrival/departure times, and verifying the correct time appears in the hero card, route card, and schedule timeline.

**Acceptance Scenarios**:

1. **Given** a stop with arrival "07:00" and departure "07:05", **When** a commuter views the route hero card, **Then** "07:00" is displayed as the scheduled time beside the ETA.
2. **Given** a stop with arrival "07:00" and departure "07:05", **When** viewing the schedule timeline, **Then** the stop shows "07:00 - 07:05" as a range.
3. **Given** a stop with arrival equal to departure ("07:30"), **When** viewing the schedule timeline, **Then** only "07:30" is displayed (no range).

---

### User Story 4 - Tracking system uses correct time field for each purpose (Priority: P2)

The tracking system uses arrival time for ETA computation, geofence matching, and delay detection. It uses departure time for determining schedule windows and skipping past stops. Stop ordering throughout the system is based on sequence number, not clock values.

**Why this priority**: The tracking core is the highest-risk area. Using the wrong time field (e.g., departure for ETA, or time-based sorting for sequence) causes incorrect ETAs, false delay alerts, and broken geofence logic.

**Independent Test**: Can be tested by running the tracking test suite with schedule entries that have divergent arrival/departure times and verifying each tracking function uses the correct field.

**Acceptance Scenarios**:

1. **Given** a stop with arrival "07:00" and departure "07:05", **When** computing ETA, **Then** the system targets 07:00 (arrival), not 07:05.
2. **Given** a van departed a stop at 07:05, **When** filtering past stops, **Then** the system uses departure time (07:05) to determine the van has left.
3. **Given** schedule entries ordered by sequence (1, 2, 3), **When** stop 2 has a later clock time than stop 3, **Then** stop 2 still comes before stop 3 in all ordering.
4. **Given** the first stop has departure "06:30", **When** determining the schedule window, **Then** the route is active starting from 06:30 (first departure) to the last stop's arrival time.

---

### User Story 5 - Drivers see arrival and departure times for each stop (Priority: P2)

Drivers viewing their assigned route see the scheduled arrival time as the reference for each stop (consistent with ETA), plus the departure time when it differs from arrival. This tells drivers both when they are expected at a stop and when they should leave.

**Why this priority**: Drivers need departure time to manage dwell at stops (e.g., origin point). Without it, they must guess when to depart. However, this is a display change that depends on the core data model (P1 stories).

**Independent Test**: Can be tested by viewing the driver route card for a route with stops that have different arrival/departure times.

**Acceptance Scenarios**:

1. **Given** a stop with arrival "07:00" and departure "07:05", **When** a driver views the route card, **Then** both "07:00" (arrival) and "07:05" (departure/leave by) are displayed.
2. **Given** a stop with arrival equal to departure ("07:30"), **When** a driver views the route card, **Then** only "07:30" is displayed (no redundant departure).

---

### User Story 6 - Zero-downtime migration preserves existing data (Priority: P1)

The migration from a single `time` field to the new schema preserves all existing schedule data. During migration, both old and new fields coexist. Legacy code paths that write only `time` automatically populate the new fields, and new code paths that write `arrival_time` automatically populate the legacy field. No data is lost, no inserts fail.

**Why this priority**: A failed migration means schedule data loss or service downtime. Backward compatibility during the transition is essential for a safe, phased rollout.

**Independent Test**: Can be tested by running the migration on a copy of production data and verifying all rows have correct values in both old and new columns.

**Acceptance Scenarios**:

1. **Given** existing schedule entries with only `time`, **When** the migration runs, **Then** `arrival_time` and `departure_time` both equal the original `time`, and `stop_sequence` reflects the chronological order.
2. **Given** the migration is complete, **When** a legacy code path inserts a row with only `time`, **Then** `arrival_time`, `departure_time`, and `stop_sequence` are auto-populated.
3. **Given** the migration is complete, **When** a new code path inserts a row with only `arrival_time` and `departure_time`, **Then** the legacy `time` column is auto-populated from `arrival_time`.

---

### User Story 7 - Legacy time column is removed after full migration (Priority: P3)

After all code paths have been migrated to use the new fields, the legacy `time` column and its synchronization trigger are removed. The system operates entirely on `arrival_time`, `departure_time`, and `stop_sequence`.

**Why this priority**: Cleanup step. Only safe after all writers and consumers have migrated. Lower priority because the dual-write trigger has minimal runtime cost.

**Independent Test**: Can be tested by removing the `time` column and verifying no code path references it — all tests pass, all queries succeed.

**Acceptance Scenarios**:

1. **Given** all writers use the new fields, **When** the legacy `time` column is dropped, **Then** no application errors occur.
2. **Given** the trigger is removed, **When** new entries are inserted, **Then** they succeed without the synchronization function.

---

### Edge Cases

- What happens when an admin sets arrival and departure to the exact same time? Accepted as a pass-through stop; no validation error.
- What happens when two concurrent admin inserts create the same sequence number? The unique constraint on `(route_id, stop_sequence)` causes the second insert to fail with a conflict error. This is accepted for admin-only, low-frequency writes.
- What happens when a stop is deleted mid-sequence (e.g., stop 2 of 4)? Gaps in sequence are harmless; ordering is relative, not positional. No automatic resequencing is needed.
- What happens when the first stop has no dwell time? `arrival_time` = `departure_time` is valid.
- What happens when the last stop has a departure time? For terminal stops, `departure_time` should equal `arrival_time` (no dwell). The system does not enforce this beyond the `departure >= arrival` constraint.
- What happens to pre-computed OSRM distances after reorder? `osrm_distance_m` values represent distances between consecutive stops in the original order. After reorder they become stale. Accepted limitation: the admin should re-run `scripts/precompute-stop-distances.ts` after reordering. No automatic invalidation is added (YAGNI — reordering is rare).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store separate arrival time and departure time for each schedule entry.
- **FR-002**: System MUST store an explicit integer stop sequence for each schedule entry that determines ordering independently of clock values.
- **FR-003**: System MUST enforce that departure time is never earlier than arrival time, both at the data level and at the input validation level.
- **FR-004**: System MUST provide an admin interface with two time input fields (arrival and departure) per schedule stop.
- **FR-005**: System MUST provide an admin endpoint to reorder stops within a route, updating their sequence numbers. The reorder request must include all entry IDs for the route; partial reorders are rejected.
- **FR-006**: System MUST use arrival time for ETA computation, geofence matching, delay detection, and display beside ETA.
- **FR-007**: System MUST use departure time for schedule window calculation (route active from first departure to last arrival) and for filtering past stops (van already departed).
- **FR-008**: System MUST use stop sequence (not clock values) for all ordering of stops throughout the application.
- **FR-009**: System MUST uniquely identify schedule entries by route and sequence number (replacing the current route + time uniqueness).
- **FR-010**: System MUST match stops by unique identifier rather than by name + time combination.
- **FR-011**: System MUST expose separate arrival time and departure time in all API responses.
- **FR-012**: Driver view MUST show arrival time as the stop reference and departure time as "leave by" when departure differs from arrival; when equal, show a single time.
- **FR-013**: Public schedule timeline MUST show a time range when arrival and departure differ, and a single time when they are equal.
- **FR-014**: System MUST backfill existing data so that arrival time and departure time both equal the current time value, with sequence derived from chronological order.
- **FR-015**: System MUST maintain backward compatibility during migration via bidirectional synchronization — legacy writes populate new fields and vice versa.
- **FR-016**: System MUST use departure time of the first stop for cold-start detection ("van should have departed by now").

### Key Entities

- **Schedule Entry**: A scheduled stop within a route. Key attributes: stop name, arrival time, departure time, stop sequence, stop coordinates (lat/lng), stop group identifier. Belongs to exactly one route. Ordered by stop sequence within its route.
- **Route**: A van's daily itinerary. Contains an ordered collection of schedule entries. The schedule window spans from first entry's departure time to last entry's arrival time.
- **Next Stop**: A derived concept representing the upcoming stop for a van in progress. References a schedule entry's arrival time as the ETA target and its departure time for time-floor filtering.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing schedule data is preserved after migration — zero entries lost, all backfilled values match the original time.
- **SC-002**: Admin can create and edit schedule entries with separate arrival and departure times without errors.
- **SC-003**: Admin can reorder stops in any position within a route, and the new order is reflected across all views.
- **SC-004**: Commuters see the correct arrival time beside ETA on all public-facing views (hero card, route card, schedule timeline).
- **SC-005**: All existing tracking tests pass after refactoring — no regression in ETA accuracy, geofence matching, or delay detection.
- **SC-006**: Schedule timeline correctly displays time ranges for stops with different arrival/departure, and single times when they are equal.
- **SC-007**: No application errors occur during the transition period while both old and new fields coexist.
- **SC-008**: After final cleanup, the legacy time column and synchronization trigger are fully removed with no remaining references.

## Assumptions

- There is typically one admin user editing schedules at a time; concurrent admin writes to the same route are rare enough that a conflict error on sequence collision is acceptable.
- Existing schedule data uses `time` identically for both arrival and departure (i.e., no implicit arrival/departure distinction exists today), so backfilling both to the same value is lossless.
- The tracking test suite provides sufficient coverage to detect regressions when switching time fields — no new end-to-end tests are needed beyond updating existing fixtures.
- Stop sequence gaps after deletions are acceptable and do not require automatic resequencing.
- The reorder UX mechanism (drag-and-drop, up/down buttons, etc.) is a plan-level decision deferred to implementation.
