# Feature Specification: Inactive Route Schedule Display

**Feature Branch**: `010-inactive-route-schedule`
**Created**: 2026-02-28
**Status**: Draft
**Input**: User description: "When a route is out of operation, show all schedule stops immediately without the collapsible toggle. Use a neutral visual style instead of gray 'past' checkmarks."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View full schedule for an inactive route (Priority: P1)

As a passenger viewing a route that is currently out of operation ("Fora de operação"), I want to see the complete schedule of stops immediately so I can plan my trip for when the route resumes.

**Why this priority**: This is the core problem — when a route is inactive, the user sees an empty schedule card with only a "Ver X paradas anteriores" button, providing no useful information at first glance.

**Independent Test**: Can be fully tested by navigating to any route detail page when the route is not running (outside operating hours or van location not updated today) and verifying the full stop list is visible without any interaction.

**Acceptance Scenarios**:

1. **Given** a route is out of operation, **When** a user opens the route details page, **Then** all schedule stops are displayed immediately without a collapsible toggle.
2. **Given** a route is out of operation, **When** a user views the schedule, **Then** no "Ver X paradas anteriores" button is shown.
3. **Given** a route is out of operation, **When** a user views the schedule, **Then** stops are displayed with a neutral visual style (not the gray checkmark "past" appearance).

---

### User Story 2 - Active route retains collapsible behavior (Priority: P1)

As a passenger viewing an active route ("Em operação"), I want the schedule to continue showing only upcoming stops by default with the option to expand past stops, so I can quickly find the next stop without scrolling through already-passed stops.

**Why this priority**: Equally critical — this is a regression guard. The existing collapsible behavior for active routes must not change.

**Independent Test**: Can be fully tested by navigating to a route detail page when the route is actively running and verifying that past stops are hidden behind the collapsible, with current and future stops visible by default.

**Acceptance Scenarios**:

1. **Given** a route is in operation with past stops, **When** a user opens the route details page, **Then** past stops are hidden and the "Ver X paradas anteriores" button is shown.
2. **Given** a route is in operation, **When** the user clicks "Ver X paradas anteriores", **Then** all past stops become visible with the existing gray checkmark styling.
3. **Given** a route is in operation, **When** a user views the schedule, **Then** the current stop has the blue pulsing indicator and future stops have the default dot styling.

---

### Edge Cases

- What happens when a route has zero schedule entries? The existing "Nenhum horário disponível" empty state should still display regardless of active/inactive status.
- What happens when the route transitions from active to inactive during polling (every 30 seconds)? The schedule should re-render to show all stops in neutral style without the collapsible.
- What happens when a route is inactive but the schedule status is "not_started" (before operating hours)? Stops should still display in neutral style — the route is not running regardless of the reason.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a route is not running, the system MUST display all schedule stops immediately without any collapsible or toggle mechanism.
- **FR-002**: When a route is not running, the system MUST display schedule stops with a neutral visual indicator (not the gray checkmark used for elapsed stops on active routes, and not the blue pulsing dot used for the current stop).
- **FR-003**: When a route is not running, stop names and times MUST use standard-contrast text styling (not the faded gray used for past stops on active routes).
- **FR-004**: When a route IS running, the system MUST retain the existing collapsible behavior — past stops hidden by default with a "Ver X paradas anteriores" expansion button.
- **FR-005**: When a route IS running, the system MUST retain existing visual styles for past (gray checkmark), current (blue pulsing dot), and future (neutral dot) stops.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users viewing an inactive route can see the full schedule without any taps or interactions — zero additional actions required to view all stops.
- **SC-002**: The visual distinction between "inactive route schedule" and "active route past stops" is clear — inactive stops do not use checkmarks or faded text.
- **SC-003**: Active route behavior is unchanged — past stops remain hidden behind the collapsible toggle exactly as they do today.

## Assumptions

- The `isRunning` boolean from the API is the sole determinant for choosing between inactive (neutral) and active (past/current/future) display modes.
- The neutral visual style for inactive stops should use a simple dot indicator (similar to the existing "future" stop node) and standard text contrast, keeping the design consistent with the existing design system.
- No API changes are needed — `isRunning` is already returned in the route detail response and available in the parent page component.
