# Feature Specification: Hide Idle Status from Passenger UI

**Feature Branch**: `026-hide-idle-status`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Hide 'Entre turnos' (between shifts) status from the passenger-facing UI. When a route's runStatus is 'idle', display it as 'Em operação' instead of showing the 'Entre turnos' badge and hero card."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger sees operating status during shift breaks (Priority: P1)

A passenger opens the routes list while a van is between driver shifts. Instead of seeing the confusing "Entre turnos" label — which is an internal operational term — they see the familiar "Em operação" badge with the green dot, just like any other active route. The next stop, scheduled time, and ETA continue to display normally.

**Why this priority**: This is the core change. Passengers should never encounter internal shift terminology — it creates confusion and implies the service is paused when it is not.

**Independent Test**: Can be fully tested by viewing the routes list when a route has `runStatus = "idle"` and verifying the badge shows "Em operação" with the green indicator.

**Acceptance Scenarios**:

1. **Given** a route with `runStatus = "idle"`, **When** a passenger views the routes list, **Then** the route card shows the green "Em operação" badge (not "Entre turnos").
2. **Given** a route with `runStatus = "idle"`, **When** a passenger views the routes list, **Then** the next stop name, scheduled time, and ETA display normally as they would for an active route.

---

### User Story 2 - Passenger sees normal route detail during shift breaks (Priority: P1)

A passenger opens the detail page for a route that is between driver shifts. Instead of seeing the amber "Entre turnos" banner with a clock icon, they see the standard active route hero card with next stop information, live location link, and ETA — the same view they'd see for any operating route.

**Why this priority**: Equal priority to Story 1 — both the list and detail views must be consistent. Showing "Em operação" on the list but "Entre turnos" on the detail page would be contradictory.

**Independent Test**: Can be fully tested by navigating to a route detail page when the route has `runStatus = "idle"` and verifying the hero card shows next stop information instead of the "Entre turnos" banner.

**Acceptance Scenarios**:

1. **Given** a route with `runStatus = "idle"` and a valid next stop, **When** a passenger opens the route detail page, **Then** the hero card displays the next stop name, time, and ETA (not the "Entre turnos" banner).
2. **Given** a route with `runStatus = "idle"` and a live location URL, **When** a passenger opens the route detail page, **Then** the "Abrir localização ao vivo" button is visible and functional.

---

### User Story 3 - Admin/driver views retain shift status (Priority: P2)

An admin or driver viewing the driver-facing UI still sees the "idle" status as designed. This change only affects the public passenger-facing components — the driver route card and any admin tooling remain unchanged.

**Why this priority**: Drivers and admins need the operational detail to manage shifts. Removing it from their views would reduce operational visibility.

**Independent Test**: Can be tested by viewing the driver route card when a route has `runStatus = "idle"` and verifying it still shows the between-shifts indicator.

**Acceptance Scenarios**:

1. **Given** a route with `runStatus = "idle"`, **When** a driver views the driver route card, **Then** the existing shift status indicator remains unchanged.

---

### Edge Cases

- What happens when a route is "idle" but has no upcoming scheduled stops? It should fall through to the existing "Fora de operação" or "Programação encerrada" states, same as an active route with no stops.
- What happens when a route transitions from "idle" to "in_progress" while a passenger is viewing? The display should already show "Em operação", so the transition is seamless with no visible change to the passenger.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The passenger-facing route status badge MUST display "Em operação" (with green dot) when the route's `runStatus` is "idle", identical to the "in_progress" display.
- **FR-002**: The passenger-facing route detail hero card MUST NOT show the "Entre turnos" amber banner when the route's `runStatus` is "idle". It MUST instead render the standard active route view (next stop, time, ETA, location link).
- **FR-003**: The driver-facing route card MUST continue to display the existing shift status indicator for "idle" routes without modification.
- **FR-004**: The mapping from "idle" to "Em operação" MUST be applied only in the public-facing UI components — no backend or API changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Passengers never see the text "Entre turnos" anywhere in the public UI, regardless of the route's internal run status.
- **SC-002**: All route information (next stop, ETA, live location) remains accessible to passengers during shift breaks, with no loss of functionality compared to active routes.
- **SC-003**: Driver and admin interfaces continue to display shift-related status without any change in behavior.

## Assumptions

- The "idle" run status will continue to provide the same data (next stop, ETA, location URL) as "in_progress" routes, since the route is still operational.
- Only two public-facing components are affected: `RouteStatusBadge` and `HeroCard` (both under `src/components/public/`).
- No new UI states or components are needed — the change is purely removing the "idle" branch and letting it fall through to the active route rendering.
