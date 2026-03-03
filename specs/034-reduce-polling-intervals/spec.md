# Feature Specification: Reduce Polling Intervals

**Feature Branch**: `034-reduce-polling-intervals`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "We need to reduce polling intervals for faster UI updates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Faster Van Position Updates on Route List (Priority: P1)

As a passenger viewing the route list, I want van positions and ETAs to update more frequently so that I can make timely decisions about when to head to my stop.

**Why this priority**: The route list is the primary screen users see. Stale position data (currently up to 15 seconds old) can cause passengers to miss a van or wait unnecessarily. Reducing this interval directly improves the core user experience.

**Independent Test**: Can be fully tested by opening the route list while a van is in transit and confirming that position/ETA data refreshes at the new, shorter interval.

**Acceptance Scenarios**:

1. **Given** a user is viewing the route list and a van is actively transmitting GPS pings, **When** the van moves, **Then** the displayed position and ETA update within the new polling interval.
2. **Given** a user is viewing the route list, **When** the polling interval elapses, **Then** a background data refresh occurs without disrupting the user's scroll position or UI state.

---

### User Story 2 - Faster Route Detail Updates (Priority: P1)

As a passenger viewing a specific route's detail page (with map and stop list), I want the van's position on the map and stop status to update more frequently for a near-real-time tracking experience.

**Why this priority**: The route detail page shows the live map with the van's position. This is where real-time feel matters most — passengers watching the van approach their stop need frequent updates.

**Independent Test**: Can be fully tested by opening a route detail page while a van is in transit and confirming map marker and stop status refresh at the new interval.

**Acceptance Scenarios**:

1. **Given** a user is viewing the route detail page, **When** the polling interval elapses, **Then** the van marker position on the map updates smoothly.
2. **Given** a user is on the route detail page and a stop status changes (e.g., from "pending" to "passed"), **When** the next poll completes, **Then** the stop list reflects the updated status.

---

### User Story 3 - Announcements Refresh Faster (Priority: P2)

As a passenger, I want to see new announcements sooner after they are published so that I stay informed about service changes or disruptions.

**Why this priority**: Announcements change less frequently than van positions, but a 60-second delay can still matter during service disruptions. A moderate reduction keeps users informed without excessive server load.

**Independent Test**: Can be verified by publishing an announcement and confirming the user sees it within the new polling interval.

**Acceptance Scenarios**:

1. **Given** a user has the app open, **When** an admin publishes a new announcement, **Then** the user sees it within 30 seconds.

---

### Edge Cases

- What happens when the user's device has a slow or intermittent network connection? Polling must not stack overlapping requests; each poll should be skipped if the previous one is still in flight.
- What happens when the app tab is in the background? The existing behavior (browser pauses intervals for background tabs) is acceptable.
- What happens under high concurrent user load? The server must handle the increased request rate from more frequent polling without degradation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Route list data MUST refresh at an interval of 5 seconds (reduced from 15 seconds).
- **FR-002**: Route detail data MUST refresh at an interval of 5 seconds (reduced from 15 seconds).
- **FR-003**: Announcements data MUST refresh at an interval of 30 seconds (reduced from 60 seconds).
- **FR-004**: Polling MUST NOT produce overlapping in-flight requests for the same data query.
- **FR-005**: Data refreshes MUST NOT disrupt the current UI state (scroll position, expanded sections, animations).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see van position updates within 5 seconds of the data becoming available on the server (down from 15 seconds).
- **SC-002**: Users see new announcements within 30 seconds of publication (down from 60 seconds).
- **SC-003**: No increase in user-facing errors or loading states caused by the higher polling frequency under normal network conditions.
- **SC-004**: App remains responsive (no jank or scroll interruptions) during background data refreshes.
