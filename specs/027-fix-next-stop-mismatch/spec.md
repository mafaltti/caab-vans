# Feature Specification: Fix Next Stop Mismatch

**Feature Branch**: `027-fix-next-stop-mismatch`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Fix the next stop mismatch between getNextStop (time-based) and computeEta (status-based) by unifying the next stop source in the API response."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger sees ETA for all active route stops (Priority: P1)

A passenger opens the route list or route detail page while a van is actively running a route. Even when a stop's scheduled time has already passed but the van has not yet physically reached it (missed geofence), the passenger should see the correct next stop with an ETA.

**Why this priority**: This is the core bug. Without this fix, passengers see no ETA whenever a van passes a stop's scheduled time without triggering the geofence, making the tracking feature unreliable.

**Independent Test**: Can be verified by starting a route run, simulating GPS pings that skip a stop's geofence, and confirming the route card still displays ETA.

**Acceptance Scenarios**:

1. **Given** a van is running a route and a stop's scheduled time has passed without geofence trigger, **When** a passenger views the route list, **Then** the route card shows the correct pending stop name and an ETA.
2. **Given** a van is running a route and a stop's scheduled time has passed without geofence trigger, **When** a passenger views the route detail page, **Then** the hero card shows the same pending stop name with an ETA matching the route card.
3. **Given** a van is running a route and all stops have been passed via geofence normally, **When** a passenger views the route list, **Then** the next stop and ETA display as they do today (no regression).

---

### User Story 2 - Consistent stop indication across all UI elements (Priority: P2)

A passenger viewing the route detail page sees the same "next stop" highlighted in the schedule timeline, the hero card, and the route card. There is no conflicting information between these elements.

**Why this priority**: Conflicting stop indicators erode user trust. The timeline already uses the tracking-based next stop, so unifying the other elements with it eliminates confusion.

**Independent Test**: Can be verified by opening a route detail page during an active run where a stop was missed, and checking that the timeline highlight, hero card stop name, and progress indicator ("Parada X de Y") all reference the same stop.

**Acceptance Scenarios**:

1. **Given** a van has missed a geofence for a past-scheduled stop, **When** a passenger views the route detail page, **Then** the timeline, hero card, and progress counter all reference the same next stop.
2. **Given** no route run is active (route not started), **When** a passenger views the route list, **Then** the next stop is derived from the schedule as before (no change to current behavior).

---

### Edge Cases

- What happens when the van is not running (location stale)? The system should NOT override with tracking data; `isRunning` must be false, and no next stop is shown.
- What happens when all route_run_stops are marked as passed? Both the tracking-based and schedule-based next stop return null. No next stop or ETA is displayed.
- What happens when a route has no active route_run for today? The system falls back to the time-based schedule next stop, preserving current behavior.
- What happens when progress exists but `nextStopId` is null (all future pending stops exhausted)? The card should show no next stop section, same as today.
- What happens when the stop counter ("Parada X de Y") uses the old index? It must be recalculated based on the resolved next stop to stay consistent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a route run is active and tracking progress identifies a next pending stop, the system MUST use that stop as the displayed next stop across all views (route list card, route detail hero, progress counter).
- **FR-002**: When no route run is active or tracking progress has no next stop, the system MUST fall back to the existing time-based schedule logic to determine the displayed next stop.
- **FR-003**: The system MUST only apply the tracking-based override when the route is in a running state (van location is fresh and within the schedule window).
- **FR-004**: The progress counter ("Parada X de Y") MUST reflect the position of the resolved next stop in the sorted schedule, not the time-based next stop.
- **FR-005**: The ETA guard condition in UI components MUST continue to compare `nextStop.id` with `progress.nextStopId` (no component changes needed; alignment happens at the data layer).

### Key Entities

- **nextStop (displayed)**: The stop shown to the passenger on route cards and hero card. Currently derived from schedule time; after this fix, derived from tracking data when available.
- **progress.nextStopId**: The next pending stop as determined by the ETA computation engine, based on actual geofence pass/pending status.
- **timeFloor**: The lower time bound used by ETA computation, derived from the active shift's `started_at` timestamp, which can be earlier than the current time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ETA is visible on 100% of route cards for actively running routes, regardless of whether stops were reached via geofence or missed.
- **SC-002**: The next stop name shown on the route card, route detail hero, and schedule timeline are identical for any given route at any point in time.
- **SC-003**: Existing routes without an active route_run continue to display the time-based next stop with no change in behavior (zero regressions).
- **SC-004**: The progress counter ("Parada X de Y") matches the resolved next stop position in 100% of cases.

## Assumptions

- The `computeEta` function already correctly identifies the next pending stop using tracking data and the `timeFloor` from `startedAt`. No changes are needed in the ETA computation logic.
- The `getNextStop` function remains useful and correct for non-tracked routes (no active route_run). It is not being removed or modified.
- UI components (`route-card.tsx`, `hero-card.tsx`, `page.tsx`, `schedule-timeline.tsx`) require no changes. The fix is purely at the API data assembly layer.
- The override only applies when `isRunning === true`, which already requires both a fresh van location and the current time being within the schedule window.
