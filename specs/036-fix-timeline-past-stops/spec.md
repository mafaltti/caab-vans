# Feature Specification: Fix Timeline Stops Incorrectly Marked as Past When Van Is Late

**Feature Branch**: `036-fix-timeline-past-stops`
**Created**: 2026-03-04
**Status**: Draft
**Input**: User description: "Fix timeline stops incorrectly marked as past when van is running late"

## Problem Statement

When a van is running behind schedule, stops that come **after** the current next stop in the timeline are incorrectly displayed as "passed" (gray checkmark icon). This happens because the timeline classification uses a time-based fallback (`entry.time < serverTime`) that does not account for schedule order — it marks any stop with a scheduled time earlier than the current server time as "past", even if the van has not reached it yet.

**Example**: Van's next stop is "Mundo Plaza" scheduled at 07:45, but the current time is 09:02. Stops like TRT-5 (08:00), Comércio (08:30), and CAAB (08:40) are all shown as passed because their scheduled times are before 09:02, even though the van hasn't visited them.

**Impact**: Users see a misleading timeline where future stops appear already completed, and the "hide previous stops" toggle collapses stops that haven't been visited, making the schedule harder to read.

## User Scenarios & Testing

### User Story 1 - Correct Timeline When Van Is Late (Priority: P1)

As a passenger viewing a route where the van is running late, I want stops after the current next stop to show as upcoming (empty circle), so I can accurately see which stops remain.

**Why this priority**: This is the core bug — misleading timeline status confuses passengers about which stops are still ahead.

**Independent Test**: Can be fully tested by viewing any route where the van is behind schedule by more than one stop interval; stops after the highlighted "next stop" should display as future (empty circles), not past (gray checkmarks).

**Acceptance Scenarios**:

1. **Given** a van is running and its next stop is "Mundo Plaza" at 07:45 with server time 09:02, **When** a passenger views the route timeline, **Then** all stops after "Mundo Plaza" (TRT-5 08:00, Comércio 08:30, etc.) display as upcoming with empty circle icons.
2. **Given** a van is running and its next stop is the 5th entry in the schedule with server time past the 10th entry's time, **When** a passenger views the route timeline, **Then** entries 1–4 display as past, entry 5 displays as current, and entries 6+ display as future.
3. **Given** a van is running on time (next stop's scheduled time is in the future), **When** a passenger views the route timeline, **Then** the behavior is unchanged — stops before the next stop show as past, stops after show as future.

---

### User Story 2 - Correct "Hide Previous Stops" Count (Priority: P2)

As a passenger, I want the "hide previous stops" toggle to only count stops the van has actually passed, so the collapsed count is accurate.

**Why this priority**: The inflated count is a direct consequence of the misclassification and compounds user confusion.

**Independent Test**: Can be tested by collapsing previous stops on a late-van route and verifying the count matches only truly passed stops (GPS-confirmed or before the current stop in schedule order).

**Acceptance Scenarios**:

1. **Given** a van has GPS-confirmed 4 passed stops and is running late at the 5th stop, **When** the passenger collapses previous stops, **Then** the toggle reads "Ver 4 paradas anteriores" (not a higher number).
2. **Given** a van has GPS-confirmed 4 passed stops but the time-based fallback would have previously counted 8, **When** the passenger collapses previous stops, **Then** only the 4 genuinely passed stops are hidden.

---

### Edge Cases

- **No GPS data available (fallback mode)**: The existing index-based fallback (using `nextStopId` position) should continue to work correctly — this bug only affects the hybrid GPS+time mode.
- **Van completes all stops**: When run status is "completed", all stops should still display as past (existing behavior, unchanged).
- **Van waiting to start**: When run status is "waiting", all stops should display as neutral (existing behavior, unchanged).
- **No inferred next stop but GPS data exists**: When `passedStopIds` has entries but `inferredNextStopId` is null (e.g., all future stops are behind the time floor), the system should fall back to time-based classification as a last resort.
- **Circular / repeating stop names**: Stops with the same name at different times (e.g., "Mundo Plaza" appears multiple times) must be classified independently by their position in the schedule, not by name.

## Requirements

### Functional Requirements

- **FR-001**: The timeline MUST classify stops after the current next stop as "future" regardless of whether their scheduled time has passed, when GPS tracking data is available and the current stop position is known.
- **FR-002**: The timeline MUST classify stops before the current next stop as "past" based on either GPS confirmation or schedule order.
- **FR-003**: The timeline MUST continue to mark GPS-confirmed passed stops as "past" regardless of their position relative to the current stop.
- **FR-004**: The timeline MUST fall back to time-based classification (`time < serverTime`) only when the current stop position cannot be determined (i.e., `inferredNextStopId` is absent).
- **FR-005**: The "hide previous stops" count MUST reflect only stops classified as "past" after applying the corrected logic.
- **FR-006**: The fix MUST NOT change behavior for routes that are on time, not running, waiting, or completed.

## Success Criteria

### Measurable Outcomes

- **SC-001**: On a route where the van is 1+ hours late, 100% of stops after the highlighted next stop display as upcoming (empty circle), not passed.
- **SC-002**: The "hide previous stops" count matches the number of stops genuinely before the current next stop (GPS-confirmed or by schedule order), with zero over-counting.
- **SC-003**: All existing timeline test cases continue to pass with no regressions.
- **SC-004**: A new test case covering the "late van with future stops whose times are before server time" scenario passes.

## Assumptions

- The `inferredNextStopId` provided by the tracking system is reliable and represents the true next stop the van will reach.
- Schedule entries are ordered chronologically within a route, so index comparison is a valid proxy for "before/after" in the timeline.
- The time-based fallback exists to cover un-geofenced stops that the van has likely already passed; this fallback is only needed for stops before the current stop, not after.
