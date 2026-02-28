# Feature Specification: Clean Time Format (Remove Seconds)

**Feature Branch**: `007-clean-time-format`
**Created**: 2026-02-28
**Status**: Draft
**Input**: User description: "Remove seconds from time display, show HH:MM format everywhere"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger views schedule times without seconds (Priority: P1)

A passenger browsing route schedules sees all departure and arrival times displayed in a clean HH:MM format (e.g., "12:40") without trailing seconds (never "12:40:00"). This applies to every screen where schedule times appear: the home page route cards, the route detail page, and the schedule timeline.

**Why this priority**: This is the core user-facing issue. Passengers see cluttered time formats with unnecessary precision that adds visual noise and feels unprofessional.

**Independent Test**: Can be verified by navigating to any public route page and confirming all displayed times use HH:MM format without seconds.

**Acceptance Scenarios**:

1. **Given** a route with schedule entries, **When** a passenger views the route card on the home page, **Then** the next stop time is displayed as "HH:MM" (e.g., "14:30") without seconds.
2. **Given** a route with schedule entries, **When** a passenger views the route detail page, **Then** all schedule times in the timeline are displayed as "HH:MM" without seconds.
3. **Given** a route with schedule entries, **When** any public-facing page renders a time value, **Then** no time on the page contains a seconds component.

---

### User Story 2 - Admin sees consistent time format in management screens (Priority: P2)

An administrator managing routes and schedules sees all time values in the same clean HH:MM format throughout the admin interface, ensuring consistency with the public-facing display.

**Why this priority**: Admin-facing consistency is important but secondary to the passenger experience. Inconsistent formats between admin and public views could cause confusion when managing schedules.

**Independent Test**: Can be verified by logging into the admin panel, editing a schedule entry, and confirming times are displayed and returned in HH:MM format.

**Acceptance Scenarios**:

1. **Given** an admin viewing the schedule editor, **When** schedule entries are loaded, **Then** all times are displayed in "HH:MM" format without seconds.
2. **Given** an admin creating a new schedule entry, **When** the entry is saved and the response is displayed, **Then** the time is shown in "HH:MM" format.
3. **Given** an admin updating an existing schedule entry, **When** the updated entry is returned, **Then** the time is shown in "HH:MM" format.

---

### Edge Cases

- What happens when a time value is stored with seconds in the database (e.g., "12:40:30")? The system must always strip seconds and display only "HH:MM".
- What happens when a time is exactly on the hour (e.g., "08:00:00")? It must display as "08:00", not "8:00" or "08:00:00".
- What happens when a time string is null or missing? The system must handle it gracefully without errors (existing behavior preserved).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all schedule-related times in "HH:MM" format (24-hour, zero-padded) across all user-facing screens.
- **FR-002**: System MUST ensure all API responses containing schedule times return the time in "HH:MM" format without seconds.
- **FR-003**: System MUST use a consistent time formatting approach across the entire codebase rather than ad-hoc string manipulation.
- **FR-004**: System MUST preserve zero-padding for hours (e.g., "08:00" not "8:00").
- **FR-005**: System MUST continue to display non-schedule timestamps (e.g., "last updated" timestamps) using the existing locale-based format, which already excludes seconds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of schedule times displayed on public pages use "HH:MM" format — no time value contains a seconds component.
- **SC-002**: 100% of schedule times returned by APIs use "HH:MM" format — no API response contains a time with seconds.
- **SC-003**: All time formatting uses a single, consistent approach rather than mixed strategies (e.g., no mix of string slicing and formatting functions for the same purpose).
