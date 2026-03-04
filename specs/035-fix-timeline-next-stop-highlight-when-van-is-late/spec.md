# Feature Specification: Fix Timeline Next-Stop Highlight

**Feature Branch**: `035-fix-timeline-next-stop-highlight-when-van-is-late`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "Fix timeline next-stop highlight when van is late"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Late Van Shows Correct Next Stop in Timeline (Priority: P1)

A passenger views a route detail page for a van that is running behind schedule. The van's scheduled arrival at the next stop was 19:20, but it's now 19:25 and the van hasn't arrived yet. The hero card correctly shows "Mundo Plaza — 19:20" as the next stop, but the schedule timeline below must also highlight that same stop as "current" (with blue indicator and "Próxima parada" label) instead of hiding it in the collapsed "previous stops" section.

**Why this priority**: This is the core bug. The mismatch between hero card and timeline confuses passengers about where the van actually is.

**Independent Test**: Can be fully tested by viewing a route detail page when a van is late and verifying the timeline highlights the correct next stop.

**Acceptance Scenarios**:

1. **Given** a van is running and its next stop (per GPS tracking) has a scheduled time earlier than the current time, **When** a passenger views the route detail page, **Then** the timeline highlights that stop as "current" with blue styling and "Próxima parada" label.
2. **Given** a van is running and its next stop (per GPS tracking) has a scheduled time earlier than the current time, **When** a passenger views the route detail page, **Then** the next stop is NOT collapsed into the "previous stops" section.
3. **Given** a van is running on time and its next stop has a scheduled time later than the current time, **When** a passenger views the route detail page, **Then** the timeline still correctly highlights that stop as "current" (no regression).

---

### User Story 2 - GPS-Passed Stops Remain Marked as Past (Priority: P1)

Stops that the van has physically passed (confirmed by GPS geofence) must still appear as "past" in the timeline, even if the tracking system identifies a different stop as "next". The GPS-based progress must take priority for passed stops, while the tracking-identified next stop takes priority for the "current" highlight.

**Why this priority**: Equal priority to US1 — both are part of the same fix. Ensuring passed stops stay "past" prevents regression.

**Independent Test**: Can be tested by viewing a route with GPS-confirmed passed stops and verifying they show checkmark/gray styling.

**Acceptance Scenarios**:

1. **Given** a van has GPS-confirmed passed stops and a late next stop, **When** a passenger views the timeline, **Then** passed stops show "past" styling (gray checkmark) AND the next stop shows "current" styling (blue highlight).
2. **Given** a van has passed 5 stops and the 6th stop is late, **When** viewing the timeline, **Then** the 5 passed stops are collapsed under "Ver 5 paradas anteriores" and the 6th stop is visible as "current".

---

### Edge Cases

- What happens when the van is so late that multiple scheduled stops have passed the current time but none have been GPS-confirmed as passed? The tracking-identified next stop should still be highlighted as "current".
- What happens when the route is running but has no GPS tracking data yet (no passed stops, no next stop ID)? The timeline should show stops in a neutral or schedule-based state, not mark everything as "past".
- What happens when the van reaches the last stop of the schedule? The last stop should be marked "current" if it's the tracking-identified next stop, regardless of time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The timeline MUST mark a stop as "current" when it matches the GPS/tracking-identified next stop, regardless of whether its scheduled time has already passed.
- **FR-002**: The timeline MUST mark GPS-confirmed passed stops as "past", even if they share the same stop name as future stops in the repeating schedule.
- **FR-003**: The "current" stop determination from tracking data MUST take priority over time-based "past" determination when both conditions apply to the same stop.
- **FR-004**: Stops that are neither GPS-passed nor the tracking-identified next stop MUST use time-based comparison (time < current time = "past", time >= current time = "future") as a fallback.
- **FR-005**: The hero card and the timeline MUST agree on which stop is "next" — if the hero card shows a stop as next, the timeline MUST highlight that same stop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a van is running late, the next stop is visible and highlighted in the timeline 100% of the time (currently 0% when late).
- **SC-002**: The hero card next stop and the timeline highlighted stop match in all scenarios (on-time, late, very late).
- **SC-003**: No regression in on-time van display — stops that are on schedule continue to display correctly.
- **SC-004**: All existing timeline tests continue to pass, plus new tests cover the late-van scenario.

## Assumptions

- The GPS/tracking-based `inferredNextStopId` from the route progress data is the authoritative source for which stop is "next" when tracking is active.
- The schedule-based time comparison is a reasonable fallback for stops that are not explicitly tracked (neither passed nor identified as next).
- The repeating schedule (same stop names appearing multiple times per day) is handled correctly by using stop IDs rather than stop names for identification.
