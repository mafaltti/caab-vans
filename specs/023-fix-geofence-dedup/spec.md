# Feature Specification: Fix Geofence Duplicate Stop Passing

**Feature Branch**: `023-fix-geofence-dedup`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Fix geofence stop-passing to only mark next chronological occurrence of repeated stop locations"

## Clarifications

### Session 2026-03-02

- Q: Should the system prevent marking a future stop as "passed" when the current time is far earlier than the stop's scheduled time? → A: Yes — time window guard. Only mark a stop as "passed" if the current time is within 30 minutes before the stop's scheduled time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct Next Stop Display for Round-Trip Routes (Priority: P1)

A passenger viewing the dashboard sees the correct "next stop" for a van that visits the same location multiple times per day (e.g., CAAB at 07:00, 09:00, 11:00). When the van arrives at CAAB for its 07:00 trip, only the 07:00 occurrence is marked as passed. The 09:00 and 11:00 occurrences remain pending and are shown as upcoming stops at the appropriate times.

**Why this priority**: This is the core bug. Without this fix, a single arrival at a repeated stop corrupts the entire day's progress, making the dashboard unreliable for all subsequent trips.

**Independent Test**: Can be tested by sending GPS pings near a stop that appears multiple times in the schedule and verifying only the next chronological occurrence is marked as passed.

**Acceptance Scenarios**:

1. **Given** a route with CAAB scheduled at 07:00, 09:00, and 11:00 (all pending), **When** the van enters the CAAB geofence at 07:05, **Then** only the 07:00 CAAB stop is marked as "passed" and the 09:00 and 11:00 CAAB stops remain "pending".
2. **Given** a route where the 07:00 CAAB stop is already "passed", **When** the van enters the CAAB geofence again at 09:03, **Then** the 09:00 CAAB stop is marked as "passed" and the 11:00 CAAB stop remains "pending".
3. **Given** a route where all earlier CAAB stops are "passed", **When** the van enters the CAAB geofence at 11:02, **Then** the 11:00 CAAB stop is marked as "passed".
4. **Given** a route where the van parks at CAAB from 07:10 to 08:50 (sending continuous pings), **When** the next CAAB occurrence is at 09:00, **Then** the 09:00 CAAB stop remains "pending" until the current time is within 30 minutes of 09:00 (i.e., 08:30 or later).

---

### User Story 2 - Accurate ETA After Partial Day Progress (Priority: P2)

A passenger checks the dashboard mid-day. The ETA and stop progress reflect only the stops that have actually been visited so far, not future occurrences of the same location that were incorrectly pre-marked.

**Why this priority**: The ETA computation depends on which stops are marked as "passed". If future stops are incorrectly marked, the ETA becomes meaningless.

**Independent Test**: Can be tested by verifying the ETA response after a van has visited a repeated stop once — the next occurrence of the same stop should still appear in the pending list with a valid ETA.

**Acceptance Scenarios**:

1. **Given** a van that just passed CAAB at 07:00 and the next occurrence of CAAB is at 09:00, **When** a passenger checks the route at 08:30, **Then** CAAB (09:00) appears as the upcoming stop with a valid ETA based on the van's current position.

---

### Edge Cases

- What happens when the van is near a repeated stop but it's far too early for the next scheduled occurrence (e.g., van is near CAAB at 07:30, next CAAB is at 09:00)? The stop is NOT marked as "passed" because the current time is more than 30 minutes before the scheduled time.
- What happens when two different stops share the same physical coordinates but different names? The same deduplication logic applies since geofence matching is coordinate-based.
- What happens when the van lingers at a stop across the boundary of two scheduled times (e.g., arrives at 08:55, next occurrences at 08:50 and 09:00)? Only the earliest pending occurrence is marked, provided it falls within the 30-minute time window.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a van enters the geofence of a stop location, the system MUST mark only the **first pending occurrence** (by schedule time order) of that location as "passed".
- **FR-002**: The system MUST NOT mark any subsequent pending occurrences of the same location as "passed" in the same geofence event.
- **FR-003**: Once the first pending occurrence is marked as "passed", the next pending occurrence of the same location MUST remain available for future geofence detection.
- **FR-004**: The chronological ordering MUST be based on the stop's scheduled time, not on the order of GPS pings.
- **FR-005**: Existing behavior for stops that appear only once in the schedule MUST remain unchanged.
- **FR-006**: The system MUST NOT mark a stop as "passed" if the current time is more than 30 minutes before the stop's scheduled time (time window guard).

### Key Entities

- **schedule_entry**: A single stop in a route's schedule — has a time, location (lat/lng), and geofence radius. The same physical location may appear in multiple entries at different times.
- **route_run_stop**: A per-day instance of a schedule entry — tracks whether the van has "passed" this stop today. Multiple route_run_stops may reference the same physical location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a van visits a location that appears N times in the schedule, exactly 1 stop is marked as "passed" per visit (not N stops).
- **SC-002**: After a van completes a full day of round trips, all stop occurrences are marked as "passed" in the correct chronological order with accurate timestamps.
- **SC-003**: The ETA for upcoming stops remains accurate throughout the day, reflecting only stops that have actually been visited.
- **SC-004**: Routes with stops that appear only once continue to work identically to current behavior (no regression).
- **SC-005**: A van parked at a repeated stop location does not prematurely mark future occurrences until within 30 minutes of the scheduled time.
