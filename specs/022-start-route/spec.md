# Feature Specification: Start Route

**Feature Branch**: `022-start-route`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Add a 'Start Route' feature that lets drivers explicitly start and end their route from the web app."

## Clarifications

### Session 2026-03-02

- Q: How should a driver be associated with their route(s)? → A: Driver is assigned to a van, and inherits the van's route(s). This aligns with the physical reality (a driver operates a specific van) and leverages the existing van-to-route relationship.
- Q: Can a driver undo ending a route (e.g., accidental tap)? → A: Ending is final — no undo. The system requires a confirmation step before ending to prevent accidental taps.
- Q: Can admins/superusers start/end a route on behalf of a driver? → A: No — only the assigned driver can start/end their route for MVP. The time-aware fallback covers the "driver forgets" scenario. Admin override can be added later.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver Starts Their Route (Priority: P1)

A driver opens the web app on their phone browser, logs in with their email and password, sees their assigned route for today, and taps "Start Route" to signal that their shift has begun. The system records the start time and begins considering only the stops from that point forward for progress tracking.

**Why this priority**: This is the core action — without it, the system cannot distinguish between a route that hasn't started yet and one that started hours ago with missed morning stops. It directly fixes the ETA/next-stop accuracy problem described in the bug analysis.

**Independent Test**: Can be fully tested by logging in as a driver, tapping "Start Route," and verifying that the system records a start time and only tracks stops scheduled after that time.

**Acceptance Scenarios**:

1. **Given** a driver is logged in and has an assigned route for today that hasn't been started, **When** they tap "Start Route," **Then** the system records the current time as the route's start time and the route transitions to "in progress."
2. **Given** a driver starts their route at 18:00 on a schedule that runs 00:00–23:40, **When** the system computes progress, **Then** only stops scheduled at 18:00 or later are considered for next-stop and ETA calculations. Morning stops are treated as skipped.
3. **Given** a driver has already started their route today, **When** they view the route page, **Then** they see the route as "in progress" with no option to start again.

---

### User Story 2 - Driver Ends Their Route (Priority: P2)

After completing their shift, a driver taps "End Route" to signal that they are done. The system records the end time and marks the route as completed for the day.

**Why this priority**: Ending a route provides shift-level completion data and ensures the public page shows the route as finished rather than appearing stale.

**Independent Test**: Can be tested by starting a route, then tapping "End Route," and verifying the system records an end time and the route shows as completed.

**Acceptance Scenarios**:

1. **Given** a driver has an active (started but not ended) route, **When** they tap "End Route," **Then** the system asks for confirmation before recording the end time. Once confirmed, the route transitions to "completed" and cannot be restarted.
2. **Given** a route has been ended, **When** anyone views the public route page, **Then** the route shows as "completed" for the day rather than appearing stale or stuck.
3. **Given** a route has been ended, **When** the driver views their route page, **Then** they cannot end the route again but can see a summary of the completed run.

---

### User Story 3 - Public Page Shows "Waiting to Start" (Priority: P2)

A passenger viewing the public route page sees a clear "waiting to start" state when a route exists for today but the driver hasn't started it yet. This replaces the current confusing behavior where past stops show incorrect progress.

**Why this priority**: Directly improves the passenger experience by setting correct expectations instead of showing misleading ETA and next-stop information.

**Independent Test**: Can be tested by viewing the public route page for a route that has a run for today but no start time, and verifying a "waiting to start" indicator appears.

**Acceptance Scenarios**:

1. **Given** a route has a run for today but has not been started, **When** a passenger views the route page, **Then** they see a "waiting to start" status instead of misleading progress data.
2. **Given** a route transitions from "waiting to start" to "in progress" (driver taps start), **When** the passenger's page polls for updates, **Then** the page automatically updates to show live progress and ETA.

---

### User Story 4 - Driver Role and Authentication (Priority: P1)

An administrator creates a driver account using the existing user management system. The driver logs in with email and password — the same flow as admins and superusers — and sees only driver-relevant features (their assigned route, start/end controls). The driver does not have access to admin features like route management, user management, or schedule editing.

**Why this priority**: Required for Story 1 to work — drivers need authenticated access to start/end routes, and the system needs to know which routes a driver can manage.

**Independent Test**: Can be tested by creating a driver user, logging in, verifying they can see their route but cannot access admin pages.

**Acceptance Scenarios**:

1. **Given** a superuser is on the user management page, **When** they create a new user, **Then** they can assign the "driver" role in addition to the existing "admin" and "superuser" roles.
2. **Given** a user with the "driver" role logs in, **When** they access the app, **Then** they are directed to a driver-specific page showing their assigned route(s) for today.
3. **Given** a user with the "driver" role, **When** they try to access admin pages (route management, user management), **Then** they are denied access.

---

### User Story 5 - Fallback When Driver Forgets to Start (Priority: P3)

If a driver begins their shift and starts sending GPS pings without pressing "Start Route," the existing time-aware filtering (Phase 1 fix) continues to work as a permanent fallback. The system does not require an explicit start to function — it just works better with one.

**Why this priority**: Safety net to prevent the system from breaking when drivers forget. Lower priority because the Phase 1 fix already handles this.

**Independent Test**: Can be tested by sending GPS pings for a route with no explicit start and verifying that time-aware filtering correctly identifies the next upcoming stop.

**Acceptance Scenarios**:

1. **Given** a route run exists (created implicitly by GPS pings) with no explicit start, **When** the system computes ETA, **Then** it uses the time-aware filtering fallback (stops with scheduled time >= current time).
2. **Given** a route was started explicitly AND the time-aware filter is also applied, **When** the explicit start time and current time differ, **Then** the explicit start time takes precedence for stop filtering.

---

### Edge Cases

- What happens if a driver tries to start a route that already has GPS pings (run created implicitly)? The system updates the existing run with a start timestamp rather than creating a new one.
- What happens if a driver starts a route and then no GPS pings ever arrive? The route shows as "in progress" based on the start time, with schedule-based fallback for ETA.
- What happens if a driver ends a route but GPS pings continue arriving? Pings are still ingested (for historical data), but the public page shows the route as "completed."
- What happens if a driver tries to start a route on a day when no schedule entries exist? The system prevents starting and shows a clear message.
- What happens if the van-route 1:1 constraint changes in the future? Currently `routes.van_id` has a UNIQUE constraint, so each van has exactly one route. If this constraint is relaxed later, the driver page already renders a list of routes from the API response, so multiple routes would display naturally.
- What happens at midnight if a route spans two calendar days? The start timestamp is absolute (not just HH:mm), so it naturally handles day boundaries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow superusers to create users with a "driver" role, in addition to the existing "admin" and "superuser" roles.
- **FR-002**: System MUST allow superusers to assign a driver to a van. The driver inherits the van's route(s) automatically.
- **FR-003**: Users with the "driver" role MUST be able to log in with email and password using the same authentication flow as other roles.
- **FR-004**: The system MUST provide a driver-facing page that shows the driver's assigned route(s) for today with start/end controls.
- **FR-005**: Only the driver assigned to a van MUST be able to start that van's route(s). Starting records the current time as the route's start time on the route run for today.
- **FR-006**: Drivers MUST be able to end a route that has been started. The system MUST require confirmation before recording the end time. Once ended, the route cannot be restarted for the day.
- **FR-007**: When a route has been explicitly started, the progress-tracking system MUST only consider stops with scheduled time >= the start time for next-stop determination and ETA computation.
- **FR-008**: When a route run exists but has no start time, the public route page MUST show a "waiting to start" status.
- **FR-009**: When a route has been ended, the public route page MUST show a "completed" status for the day.
- **FR-010**: The Phase 1 time-aware filtering (stops with scheduled time >= current time) MUST remain as a permanent fallback when no explicit start time exists.
- **FR-011**: Users with the "driver" role MUST NOT have access to admin features (route management, user management, schedule editing).
- **FR-012**: Starting a route that already has an implicitly-created run (from GPS pings) MUST update the existing run rather than creating a duplicate.
- **FR-013**: GPS pings MUST continue to be ingested normally regardless of route start/end status.

### Key Entities

- **Route Run**: Represents a single day's execution of a route. Extended with a start timestamp (when the driver explicitly starts) and an end timestamp (when the driver explicitly ends). A run can exist without being started (created implicitly by GPS pings).
- **Driver**: A user with the "driver" role. Assigned to a van, and inherits that van's route(s). Authenticates with email and password via the existing auth system.
- **Van–Driver Assignment**: A driver is linked to a van. The van's existing route relationship determines which routes the driver can start/end. Managed by superusers.

## Assumptions

- Drivers use the same web app URL as passengers and admins; role-based routing directs them to the appropriate page after login.
- A single route can have only one active run per calendar day (existing constraint).
- Route assignments are relatively stable — a driver operates the same route(s) day after day, managed by a superuser.
- The Expo tracker app remains unchanged — it continues to send GPS pings using the ingestion token, completely unaware of the start/end lifecycle.
- The existing admin login page can serve all roles, including drivers, without needing a separate login flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Drivers can start and end their route in under 10 seconds from the time they open the app (assuming already logged in).
- **SC-002**: When a route is explicitly started, the ETA and next-stop displayed on the public page are accurate to the driver's actual shift, with no morning stops from before the start time shown as pending.
- **SC-003**: Passengers see a clear "waiting to start" indicator within 30 seconds of viewing a route that hasn't been started yet, eliminating confusion from stale or incorrect progress data.
- **SC-004**: The system continues to function correctly (using time-aware fallback) when drivers forget to press "Start Route," with no degradation from the Phase 1 fix behavior.
- **SC-005**: Drivers cannot access admin features, maintaining the existing role-based access control model.
