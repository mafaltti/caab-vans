# Feature Specification: Hide Next-Stop Display for Inactive Routes

**Feature Branch**: `008-fix-inactive-next-stop`
**Created**: 2026-02-28
**Status**: Draft
**Input**: User description: "When a route is not running ('Fora de operação'), the route list cards and the route detail page still show the next stop name and time. They should not."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Route Status on Route List (Priority: P1)

As a passenger browsing the route list, when a route is marked "Fora de operação" (not running), I should not see a next stop name or time on the route card. Seeing a next stop for a non-running route is misleading — it suggests the van is about to arrive at that stop when it is not.

**Why this priority**: This is the primary screen users see. Misleading next-stop info on non-running routes erodes trust and may cause passengers to wait at a stop for a van that is not coming.

**Independent Test**: Can be tested by viewing the route list when one or more routes have `isRunning = false` and verifying that no next-stop row appears on those cards.

**Acceptance Scenarios**:

1. **Given** a route is not running and a schedule-based next stop exists, **When** the user views the route list, **Then** the route card does NOT display the next stop name or time.
2. **Given** a route is not running and schedule status is "ended" (no future stops), **When** the user views the route list, **Then** the route card shows "Programação encerrada" (existing behavior, unchanged).
3. **Given** a route IS running, **When** the user views the route list, **Then** the route card displays the next stop name and time as usual (no regression).

---

### User Story 2 - Accurate Hero Card on Route Detail (Priority: P1)

As a passenger viewing a route detail page, when the route is "Fora de operação", I should not see the blue "PRÓXIMA PARADA" hero card with a stop name and time. Instead, I should see a neutral fallback indicating the route is not currently running.

**Why this priority**: The hero card is the most prominent element on the detail page. Displaying a "next stop" with a specific time for a non-running route directly contradicts the "Fora de operação" badge and confuses the user.

**Independent Test**: Can be tested by navigating to a route detail page for a non-running route and verifying the hero card shows a neutral "not running" state instead of a next stop.

**Acceptance Scenarios**:

1. **Given** a route is not running and a schedule-based next stop exists, **When** the user views the route detail page, **Then** the hero card shows a neutral message (e.g., "Fora de operação") instead of the blue "PRÓXIMA PARADA" card.
2. **Given** a route is not running and the schedule has ended, **When** the user views the route detail page, **Then** the hero card shows "Programação encerrada por hoje" (existing behavior, unchanged).
3. **Given** a route IS running, **When** the user views the route detail page, **Then** the hero card displays the blue "PRÓXIMA PARADA" card with the next stop name and time as usual (no regression).

---

### Edge Cases

- What happens when a route transitions from running to not-running while the user is viewing it? The next data refresh (polling cycle) should update the UI to hide the next stop automatically.
- What happens when `isRunning` is false but the schedule has not started yet ("not_started")? The route card and hero card should still not show a next stop, since the route is not running.
- What happens when all routes are not running? The route list displays all cards in their inactive state with no next-stop rows — no special empty-state handling needed beyond this fix.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The route list card MUST NOT display the next stop row (stop name and time) when the route is not running.
- **FR-002**: The route detail hero card MUST NOT display the "PRÓXIMA PARADA" card (blue gradient with stop name and time) when the route is not running.
- **FR-003**: The route detail hero card MUST display a neutral fallback state when the route is not running and the schedule has not ended.
- **FR-004**: All existing behavior for running routes MUST remain unchanged (no regression).
- **FR-005**: All existing behavior for routes with ended schedules MUST remain unchanged (no regression).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of non-running routes on the route list display no next-stop information.
- **SC-002**: 100% of non-running route detail pages show a neutral hero card instead of a "PRÓXIMA PARADA" card.
- **SC-003**: 100% of running routes continue to display next-stop information correctly (zero regressions).
- **SC-004**: UI updates within one polling cycle when a route transitions between running and not-running states.
