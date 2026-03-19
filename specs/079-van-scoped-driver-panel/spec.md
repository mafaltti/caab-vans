# Feature Specification: Van-Scoped Driver Panel

**Feature Branch**: `079-van-scoped-driver-panel`
**Created**: 2026-03-19
**Status**: Draft
**Input**: Scope the driver panel to the van whose tracker it was opened from, so drivers only see the route for the van they are physically in.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver Sees Only Current Van's Route (Priority: P1)

A driver is physically in Van 01, which runs the tracker app. When the driver taps "Open Driver" on the tracker, the driver panel opens showing only Van 01's assigned route. Even if this driver is also assigned to Van 03, they do not see Van 03's route — only the route for the van they are currently operating.

**Why this priority**: This is the core feature. Without van-scoped filtering, a driver assigned to multiple vans can accidentally start a shift or interact with routes for a van they are not physically in, leading to incorrect tracking data and passenger confusion.

**Independent Test**: Open the driver panel from Van 01's tracker and verify only Van 01's route appears. Then open from Van 03's tracker and verify only Van 03's route appears.

**Acceptance Scenarios**:

1. **Given** a driver assigned to Van 01 and Van 03, **When** the driver opens the driver panel from Van 01's tracker, **Then** only Van 01's route is displayed.
2. **Given** a driver assigned to a single van (Van 02), **When** the driver opens the driver panel from Van 02's tracker, **Then** Van 02's route is displayed (same as current behavior).
3. **Given** a driver assigned to Van 01, **When** the driver opens the driver panel from Van 05's tracker (a van they are not assigned to), **Then** no routes are displayed and the existing empty-state message is shown.

---

### User Story 2 - Backward Compatibility for Unscoped Access (Priority: P1)

When the driver panel is opened without van context (e.g., via direct browser access or from an older tracker version that does not send the van identifier), the panel shows all routes assigned to the driver — preserving current behavior with no regression.

**Why this priority**: Existing tracker installations that have not been updated must continue to work. Direct browser access by drivers or admins must also remain functional. This is equally critical to avoid breaking production.

**Independent Test**: Access the driver panel directly via browser without any van parameter and verify all assigned routes appear as they do today.

**Acceptance Scenarios**:

1. **Given** a driver assigned to Van 01 and Van 03, **When** the driver accesses the driver panel via browser without van context, **Then** both Van 01 and Van 03 routes are displayed.
2. **Given** a tracker app that has not been updated, **When** a driver opens the driver panel, **Then** all assigned routes are displayed (current behavior preserved).

---

### Edge Cases

- **Invalid van identifier**: If the van identifier passed from the tracker does not match any van in the system, the driver sees an empty route list with the existing "Nenhuma rota atribuída" message.
- **Driver unassigned from van after panel opens**: Route list filtering happens at request time; if a driver is unassigned from a van, subsequent requests will reflect the change.
- **Van identifier present but empty string**: Treated the same as absent — all assigned routes are shown (backward-compatible behavior).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tracker app MUST pass the van's identifier to the driver panel when opening it.
- **FR-002**: The driver panel MUST read the van identifier from the incoming context when available.
- **FR-003**: The route listing MUST filter results to only the specified van's route when a van identifier is provided.
- **FR-004**: The route listing MUST return all routes assigned to the driver when no van identifier is provided (backward compatibility).
- **FR-005**: The route detail, shift start, and shift end functionalities MUST continue to work without modification (they already validate by route and driver assignment).
- **FR-006**: An invalid or unrecognized van identifier MUST result in an empty route list, not an error.

### Key Entities

- **Van**: The physical vehicle running the tracker app. Each van has a unique identifier.
- **Driver**: An authenticated user with the driver role. A driver can be assigned to one or more vans.
- **Route**: A fixed itinerary assigned to a specific van. The relationship is 1:1 (one van, one route).
- **Driver Panel**: The web-based interface where drivers view their assigned routes and manage shifts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A driver opening the panel from a specific van's tracker sees only that van's route — 100% of the time.
- **SC-002**: A driver accessing the panel without van context sees all assigned routes — zero regression from current behavior.
- **SC-003**: The feature is fully backward-compatible: older tracker versions and direct browser access continue working without any changes on the user side.
- **SC-004**: No additional user actions are required — van scoping is automatic and transparent to the driver.

## Assumptions

- The tracker app already has access to its own van identifier at runtime.
- The van identifier is a stable, unique value suitable for use as a filter parameter.
- Drivers do not need the ability to manually switch between vans within the driver panel — the van context is determined by which tracker opened it.
- The existing route detail and shift management flows do not require van scoping because they already validate by specific route and driver assignment.
