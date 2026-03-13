# Feature Specification: Fix Arrival/Departure Time Field Usage

**Feature Branch**: `070-fix-arrival-departure-fields`
**Created**: 2026-03-13
**Status**: Draft
**Input**: Analysis document `docs/execution/0114-arrival-departure-time-handling-analysis.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger sees correct "next stop" (Priority: P1)

A passenger opens the van tracking page to see which stop the van is heading to next. When a stop has distinct arrival and departure times (e.g., arrival 09:00, departure 09:15), the system must show that stop as "next" until the van has arrived — not until it has departed.

**Why this priority**: This is the highest-severity bug. It directly affects the primary user-facing feature — showing passengers the correct next stop on the public route list and route detail pages.

**Independent Test**: Can be tested by configuring a stop with distinct arrival/departure times (e.g., arrival 09:00, departure 09:15), then checking the public route page at 09:05. The "next stop" should show this stop, not the one after it.

**Acceptance Scenarios**:

1. **Given** a stop with arrival 09:00 and departure 09:15, **When** a passenger views the route at 09:05, **Then** the system shows this stop as the next stop.
2. **Given** a stop with arrival 09:00 and departure 09:15, **When** a passenger views the route at 08:55, **Then** the system shows this stop as the next stop (arrival hasn't happened yet).
3. **Given** a stop with arrival 09:00 and departure 09:15, **When** a passenger views the route at 09:16, **Then** the system shows the following stop as the next stop.

---

### User Story 2 - Route stays active until last stop departure (Priority: P2)

The system must consider a route's schedule window as active until the van departs the final stop — not when it arrives. This affects the route status indicator ("active"/"ended"), the run status ("in_progress"/"completed"), and the orphaned-shift health check.

**Why this priority**: Premature "ended" or "completed" status hides the route from passengers and drivers while the van is still dwelling at the final stop. Also causes false "orphaned shift" alerts.

**Independent Test**: Can be tested by configuring the last stop with arrival 17:00 and departure 17:30, then checking the route status at 17:10. The route should still show as active, not ended.

**Acceptance Scenarios**:

1. **Given** a route whose last stop has arrival 17:00 and departure 17:30, **When** the system evaluates route status at 17:10, **Then** the route is still within its schedule window (active).
2. **Given** the same route, **When** the system evaluates at 17:35, **Then** the route is past its schedule window.
3. **Given** an active shift on a route whose last stop has arrival 17:00 and departure 17:30, **When** the orphaned-shift check runs at 17:10, **Then** the shift is not marked orphaned (the schedule hasn't ended yet).
4. **Given** the same route in the driver's route list, **When** the driver views at 17:10, **Then** the route status is not shown as "completed".

---

### User Story 3 - Geofence matching uses correct early arrival window (Priority: P3)

When the van enters a stop's geofence, the system checks whether the event is within 30 minutes before the stop's scheduled time. This early arrival window must be anchored to the stop's arrival time, not departure time — otherwise the window is effectively widened by the dwell time.

**Why this priority**: Lower priority because the practical impact is small (slightly wider matching window), but it's semantically wrong and creates an internal inconsistency with the proximity scoring logic which already uses arrival time.

**Independent Test**: Can be tested by configuring a stop with arrival 10:00 and departure 10:30, then sending a geofence event at 09:25 (35 minutes before arrival). The event should be rejected. Under the current buggy behavior, it would be accepted (because 09:25 is within 30 minutes of departure 10:30).

**Acceptance Scenarios**:

1. **Given** a stop with arrival 10:00 and departure 10:30, **When** a geofence event arrives at 09:25, **Then** the event is rejected (35 minutes before arrival, outside the 30-minute window).
2. **Given** the same stop, **When** a geofence event arrives at 09:35, **Then** the event is accepted (25 minutes before arrival, within the window).
3. **Given** the same stop, **When** a device geofence event arrives at 09:25, **Then** the event is also rejected (same rule applies to device-side geofence processing).

---

### Edge Cases

- What happens when arrival_time equals departure_time (zero dwell)? All behavior must remain identical to the current system — the fix must be a no-op for this case.
- What happens when the last stop is also the first stop (single-stop route)? The schedule window should span from departure_time to departure_time of that single stop.
- What happens when a geofence event arrives exactly at the boundary of the 30-minute early arrival window? The event should be accepted (boundary is inclusive).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The "next stop" lookup for public route pages MUST use the stop's arrival time to determine whether a stop has been reached, not the departure time.
- **FR-002**: The early arrival window for server-side geofence matching MUST be anchored to the stop's arrival time (30 minutes before arrival), not the departure time.
- **FR-003**: The early arrival window for device-side geofence matching MUST be anchored to the stop's arrival time (30 minutes before arrival), not the departure time.
- **FR-004**: The schedule window end (used to determine if a route is "active" or "ended") MUST use the last stop's departure time, not its arrival time.
- **FR-005**: The "past schedule window" check (used to derive run status as "completed" or "idle") MUST use the last stop's departure time.
- **FR-006**: The orphaned-shift detection MUST use the last stop's departure time to determine when the schedule ends.
- **FR-007**: The driver route listing MUST use the last stop's departure time for its independent "past schedule window" check.
- **FR-008**: When arrival_time equals departure_time, all behavior MUST remain identical to the current system (backward compatibility).

### Key Entities

- **Schedule Entry**: A scheduled stop on a route, with an arrival_time (when the van should arrive) and a departure_time (when the van should leave). The departure_time is always >= arrival_time.
- **Route Schedule Window**: The time span from the first stop's departure_time to the last stop's departure_time, during which the route is considered active.
- **Early Arrival Window**: A 30-minute buffer before a stop's arrival_time during which geofence events are eligible for matching.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When stops have distinct arrival and departure times, the correct next stop is displayed to passengers 100% of the time (verified by test cases with 15+ minute dwell times).
- **SC-002**: Routes with dwell time on the final stop remain in "active" status until the departure time, with zero premature "ended" or "completed" transitions.
- **SC-003**: The early arrival window rejects geofence events that fall outside 30 minutes before arrival time, with zero false acceptances due to dwell time widening.
- **SC-004**: All existing tests continue to pass without modification (backward compatibility for zero-dwell-time data).
- **SC-005**: New test cases cover each of the 7 fix locations with distinct arrival/departure values, achieving 100% coverage of the corrected logic paths.

## Assumptions

- The existing 30-minute early arrival window constant (`EARLY_ARRIVAL_WINDOW_MINUTES`) is correct and does not need to change.
- The schedule window start correctly uses the first stop's departure_time — this is not being changed.
- The proximity scoring in geofence matching already correctly uses arrival_time — only the early arrival gate needs fixing.
- All 154 existing schedule entries in the dev database have identical arrival/departure times; the test server has manually-set distinct values for validation.

## Out of Scope

- Changing the early arrival window duration (currently 30 minutes).
- Adding UI to manage distinct arrival/departure times per stop.
- Modifying the schedule window start logic (already correct).
- Database migrations or schema changes.
