# Feature Specification: Faster Polling Intervals

**Feature Branch**: `028-faster-polling`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Reduce polling intervals for faster UI updates on route status changes. Currently the routes list polls every 60s and route detail every 30s, which causes stale status badges (e.g., 'out of operation' showing for up to 60s after a driver starts their route). Changes: (1) Routes list refetchInterval from 60s to 15s, (2) Route detail refetchInterval from 30s to 15s, (3) Global staleTime from 30s to 10s, (4) Enable refetchOnWindowFocus globally (currently false), (5) Announcements stay at 60s."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Timely Route Status Updates (Priority: P1)

As a passenger viewing the routes list, I want route status changes (e.g., a van going from "out of operation" to "active", or vice versa) to appear within seconds, not minutes, so that I can trust the information displayed and make timely travel decisions.

**Why this priority**: This is the core problem — passengers see stale status badges for up to 60 seconds after a driver starts or ends a route, leading to confusion and mistrust.

**Independent Test**: Can be fully tested by starting/ending a driver route and observing how quickly the routes list updates in a passenger's browser.

**Acceptance Scenarios**:

1. **Given** a passenger is viewing the routes list and a van's status changes from idle to in-progress, **When** the next polling cycle completes, **Then** the status badge updates within 15 seconds of the status change.
2. **Given** a passenger is viewing the routes list and a van's status changes from in-progress to completed, **When** the next polling cycle completes, **Then** the status badge updates within 15 seconds of the status change.

---

### User Story 2 - Immediate Refresh on App Resume (Priority: P2)

As a passenger who switches away from the app (e.g., checks a message) and returns, I want the route data to refresh immediately upon returning, so that I always see up-to-date information without waiting for the next poll tick.

**Why this priority**: This addresses the most frustrating user experience — opening the app and seeing obviously stale data. It costs nothing in terms of extra polling load and delivers an instant improvement.

**Independent Test**: Can be fully tested by opening the routes list, switching to another app/tab, waiting 20+ seconds, switching back, and confirming the data refreshes immediately.

**Acceptance Scenarios**:

1. **Given** a passenger has the routes list open and switches to another app or browser tab, **When** they return to the app after any amount of time, **Then** the route data refreshes immediately (within 1-2 seconds of regaining focus).
2. **Given** a passenger has a route detail page open and switches away, **When** they return to the app, **Then** the route detail (ETA, status, stop progress) refreshes immediately.

---

### User Story 3 - Fresher ETA and Stop Progress (Priority: P3)

As a passenger viewing a specific route's detail page, I want the ETA and stop progress to update more frequently, so that I can rely on the displayed arrival times when planning my movements.

**Why this priority**: ETA accuracy improves with fresher data, and a 15s update cycle keeps the displayed ETA close to the actual computed value.

**Independent Test**: Can be fully tested by viewing a route detail page while a van is actively moving and confirming that ETA values update every 15 seconds.

**Acceptance Scenarios**:

1. **Given** a passenger is viewing a route detail page for an active route, **When** 15 seconds elapse, **Then** the ETA and stop progress data refreshes automatically.
2. **Given** a passenger navigates from the routes list to a route detail page, **When** the detail page loads, **Then** it fetches fresh data (not a cached copy older than 10 seconds).

---

### Edge Cases

- What happens when the user's device has poor network connectivity? The polling interval should not cause request pile-up; failed requests should not block subsequent polls.
- What happens when a user leaves the app open in a background tab for hours? Polling continues at the configured interval, but the window-focus refresh ensures they get fresh data when they return.
- What happens if many passengers poll simultaneously? The server should handle the increased request volume (estimated ~10 req/min per user vs. previous ~3 req/min) without degradation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The routes list page MUST poll for updated data every 15 seconds (reduced from 60 seconds).
- **FR-002**: The route detail page MUST poll for updated data every 15 seconds (reduced from 30 seconds).
- **FR-003**: The announcements page MUST continue polling every 60 seconds (unchanged).
- **FR-004**: The application MUST automatically refetch all active queries when the browser window or tab regains focus.
- **FR-005**: Cached data MUST be considered stale after 10 seconds (reduced from 30 seconds), triggering a fresh fetch on any navigation or re-render that accesses stale data.
- **FR-006**: Polling MUST NOT cause request pile-up — if a previous request is still in-flight when the next poll interval fires, the pending poll MUST be skipped or deferred.

### Assumptions

- The existing server infrastructure can handle the ~3x increase in request volume per user session without performance issues.
- The polling-only architecture remains appropriate; no migration to WebSockets or server-sent events is needed at current user scale.
- Announcements are infrequent enough that 60s polling remains acceptable for that data type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Route status changes (idle to active, active to completed) are visible to passengers within 15 seconds of the change occurring.
- **SC-002**: When a user returns to the app after switching away, route data refreshes within 2 seconds of the app regaining focus.
- **SC-003**: The application generates no more than 10 requests per minute per user session during normal browsing.
- **SC-004**: Server response times remain unchanged (no measurable degradation) under the increased polling frequency.
