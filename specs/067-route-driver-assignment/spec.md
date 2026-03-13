# Feature Specification: Route-Based Driver Assignment

**Feature Branch**: `067-route-driver-assignment`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Refactor driver assignment so routes, not vans, are the source of truth for staffing. Keep the current 1:1 route-to-van relationship unchanged. Drivers may be assigned to multiple routes, and a route may have multiple assigned drivers, but only one active shift remains allowed per route at a time.

## User Scenarios & Testing

### User Story 1 - Admin assigns drivers to a route (Priority: P1)

An admin opens the route edit form and sees a list of active drivers as checkboxes. They select one or more drivers to assign them to the route. After saving, only those selected drivers may start a shift on that route. The admin can also assign drivers during route creation.

**Why this priority**: This is the core change. Without moving assignment to routes, no other story works.

**Independent Test**: Can be fully tested by creating/editing a route with driver selections and verifying the assignment persists and appears on subsequent loads.

**Acceptance Scenarios**:

1. **Given** an admin is editing a route, **When** they select two drivers and save, **Then** both drivers appear as assigned on the next load.
2. **Given** an admin is creating a new route, **When** they select one driver and submit, **Then** the route is created with that driver assigned.
3. **Given** an admin is editing a route with two assigned drivers, **When** they deselect one and save, **Then** only the remaining driver is assigned.
4. **Given** an admin edits a route and provides no drivers, **When** they save, **Then** the route has zero assigned drivers.

---

### User Story 2 - Driver discovers and starts assigned routes (Priority: P1)

A driver opens their dashboard and sees only the routes they are assigned to. They can start a shift on any of their assigned routes. If they are not assigned to a route, they cannot start a shift on it.

**Why this priority**: Drivers must be authorized via route assignment (not van assignment) for the refactor to be complete.

**Independent Test**: Can be tested by assigning a driver to a route, logging in as that driver, and verifying the route appears and shift can be started.

**Acceptance Scenarios**:

1. **Given** a driver is assigned to Route A via the route edit form, **When** they open the driver dashboard, **Then** Route A appears in their route list.
2. **Given** a driver is assigned to Route A, **When** they start a shift on Route A, **Then** the shift begins successfully.
3. **Given** a driver is NOT assigned to Route B, **When** they attempt to start a shift on Route B, **Then** they receive a "forbidden" error.
4. **Given** a driver started a shift on Route A and is later unassigned, **When** the driver ends the shift, **Then** the shift ends successfully (shift ownership is preserved).

---

### User Story 3 - Admin no longer assigns drivers via van management (Priority: P2)

An admin opens the van edit form and no longer sees the driver assignment section. Driver assignment has been fully moved to route management. The van edit form only handles van-specific settings (name, token regeneration).

**Why this priority**: Removing the old assignment surface prevents confusion and duplicate assignment paths.

**Independent Test**: Can be tested by opening the van edit page and confirming no driver selection UI is present.

**Acceptance Scenarios**:

1. **Given** an admin opens the van edit form, **When** the form loads, **Then** no driver selection or checkbox list is displayed.
2. **Given** the van list endpoint is called, **When** the response is returned, **Then** no driver ID field is included.

---

### User Story 4 - Existing assignments migrate automatically (Priority: P1)

When the system is updated, all existing driver-to-van assignments are automatically migrated to the corresponding routes. A driver previously assigned to a van that has an associated route becomes assigned to that route. No manual re-assignment is needed.

**Why this priority**: Without migration, all existing driver assignments would be lost on deploy.

**Independent Test**: Can be tested by verifying that after migration, every driver previously assigned to a van now appears as assigned to the van's route.

**Acceptance Scenarios**:

1. **Given** a van with two assigned drivers has an associated route, **When** the migration runs, **Then** both drivers appear as assigned to the route.
2. **Given** a van with assigned drivers has NO associated route, **When** the migration runs, **Then** no orphaned assignment records are created.
3. **Given** the migration has run, **When** an admin views a route that had van-assigned drivers, **Then** those drivers appear in the route's driver list.

---

### User Story 5 - Admin fetches a dedicated driver list for assignment (Priority: P2)

When assigning drivers to a route, the system provides a list of active drivers (not the full user management list). This list is available to admins and superusers without requiring superuser-level access.

**Why this priority**: The current driver list is part of superuser-only user management. Admins need a lightweight driver list for assignment.

**Independent Test**: Can be tested by calling the driver list as an admin user and verifying it returns only active drivers.

**Acceptance Scenarios**:

1. **Given** an admin requests the driver list, **When** the response is returned, **Then** it includes only users with the "driver" role who are active.
2. **Given** a superuser requests the driver list, **When** the response is returned, **Then** it works identically.
3. **Given** a regular driver requests the driver list, **When** the request is made, **Then** it is rejected as unauthorized.

---

### Edge Cases

- What happens when a route is deleted that has assigned drivers? Assignments are removed automatically via cascade.
- What happens if an admin assigns duplicate driver IDs in a single request? The system de-duplicates them and stores only unique assignments.
- What happens if an admin assigns an inactive or non-driver user? The system rejects the request with a validation error.
- What happens if two admins update the same route's drivers concurrently? Last-write-wins (full replacement semantics).
- What happens to the old van-driver assignment data after cutover? The old table is kept physically in the database but the application no longer reads or writes to it. Cleanup is a separate follow-up.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow admins and superusers to assign zero or more active drivers to a route during creation or editing.
- **FR-002**: System MUST use full-replacement semantics when updating a route's driver assignments (the submitted list completely replaces the previous list).
- **FR-003**: System MUST de-duplicate driver IDs submitted in a single assignment request.
- **FR-004**: System MUST validate that every submitted driver ID belongs to an active user with the "driver" role before persisting.
- **FR-005**: System MUST include the list of assigned driver IDs when returning route data to admin interfaces.
- **FR-006**: System MUST authorize shift start based on route assignment (not van assignment).
- **FR-007**: System MUST allow a driver who started an active shift to end it even if their route assignment is removed after the shift began.
- **FR-008**: System MUST show drivers only the routes they are assigned to on the driver dashboard.
- **FR-009**: System MUST provide a dedicated driver options list accessible to admins and superusers, returning only active drivers with their ID and email.
- **FR-010**: System MUST remove driver assignment UI and data from van management interfaces entirely.
- **FR-011**: System MUST automatically migrate existing van-based driver assignments to the corresponding routes during deployment.
- **FR-012**: System MUST NOT create orphaned assignment records for vans that have no associated route during migration.
- **FR-013**: System MUST remove assigned drivers via cascade when a route is deleted.
- **FR-014**: System MUST continue to enforce only one active shift per route at a time.

### Key Entities

- **Route-Driver Assignment**: Links a route to an authorized driver. A route can have multiple assigned drivers, and a driver can be assigned to multiple routes. The assignment determines who may start a shift.
- **Route**: Existing entity. Gains a set of assigned drivers. Retains its 1:1 relationship with a van.
- **Driver**: An active user with the "driver" role. No new entity is created; drivers are identified from the existing user system.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admins can assign drivers to routes and see the assignment reflected immediately on the next page load, with no need to visit van management.
- **SC-002**: Drivers see only their assigned routes on the dashboard, with zero routes appearing that they are not assigned to.
- **SC-003**: 100% of existing van-based driver assignments are migrated to the corresponding routes after deployment, verified by comparing assignment counts before and after.
- **SC-004**: The van edit form contains zero driver-related UI elements after the change.
- **SC-005**: An unassigned driver receives a clear error when attempting to start a shift, with no ambiguity about the cause.
- **SC-006**: Shift start and end operations complete within the same time as before the refactor (no user-perceptible performance regression).

## Assumptions

- The 1:1 route-to-van relationship is unchanged and not part of this refactor's scope.
- The old van-driver assignment table will remain physically in the database for safe deploy sequencing. Its removal is a separate follow-up task.
- No runtime compatibility fallback to the old assignment model is allowed after cutover.
- The "driver options" list for the admin UI is a lightweight endpoint separate from the existing superuser-only user management.
- Tracker/ingestion and GPS-related functionality remain van-centric and are not affected by this refactor.
- Shift end authorization is already based on shift ownership (not van/route assignment) and requires no changes.

## Scope Boundaries

**In scope**:
- New route-driver assignment data and migration
- Admin route APIs (create, update, list) with driver assignment support
- New admin driver list endpoint
- Driver route discovery and shift start authorization via route assignment
- Removal of driver assignment from van admin APIs and UI
- Admin route form UI with driver multi-select

**Out of scope**:
- Dropping or renaming the old van-driver assignment table
- Changing the 1:1 route-to-van cardinality
- Modifying tracker/config or GPS ingestion
- Changes to shift end authorization (already correct)
- Route list layout changes (no "assigned drivers" column required)
