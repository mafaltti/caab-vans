# Feature Specification: Fix ETA Idle Suppression

**Feature Branch**: `025-fix-eta-idle-suppression`
**Created**: 2026-03-02
**Status**: Draft
**Input**: Decouple public ETA display from driver shift status. When a driver ends their shift (runStatus === "idle"), the public routes list currently suppresses ETA even though the van still has fresh GPS data and is within its schedule window.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Public ETA persists after driver ends shift (Priority: P1)

A passenger opens the public routes page to check when the next van arrives. The van has fresh GPS data and is within its schedule window. The driver has ended their shift (status "idle"), but the passenger still sees the ETA because the van is physically operating.

**Why this priority**: This is the core bug. Public users lose arrival information when a driver ends a shift, even though the van is still tracked and operating.

**Independent Test**: Can be fully tested by ending a driver shift and verifying that the public page still displays ETA for that route when GPS data is fresh.

**Acceptance Scenarios**:

1. **Given** a van with fresh GPS data within its schedule window and the driver's shift has ended (run status "idle"), **When** a user views the public routes list, **Then** the route displays the ETA based on available tracking data.
2. **Given** a van with fresh GPS data within its schedule window and no shifts have ever been started (run status "waiting"), **When** a user views the public routes list, **Then** the route displays the ETA based on available tracking data.
3. **Given** a van with fresh GPS data within its schedule window and an active shift (run status "in_progress"), **When** a user views the public routes list, **Then** the route displays the ETA (existing behavior, unchanged).

---

### User Story 2 - Driver UI still reflects shift status (Priority: P2)

A driver views their dashboard. The shift status badges ("Aguardando", "Em andamento", "Entre turnos", "Encerrada") continue to work as before. The run status is still available in the progress payload for the driver UI and public status badge.

**Why this priority**: The driver UI must not regress — shift lifecycle controls remain correct.

**Independent Test**: Can be tested by starting and ending a shift and verifying driver UI badges update correctly.

**Acceptance Scenarios**:

1. **Given** a driver has ended their shift, **When** the driver views their route, **Then** the status shows "Entre turnos" and the "Iniciar Turno" button is available.
2. **Given** the public routes list, **When** a route has run status "idle", **Then** the status badge shows "Entre turnos" (existing behavior, unchanged).

---

### Edge Cases

- What happens when the route run exists but has no route_run_stops seeded yet? ETA computation falls back to schedule-based ETA.
- What happens when run status is "completed" (past schedule window, all shifts ended)? ETA should not display since the route is done for the day.
- What happens when no active shift exists and `startedAt` is null? ETA computation uses current time as time floor (existing fallback behavior).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The public routes list MUST compute and return ETA/progress data for any route that has a route run for the current day, regardless of shift status (waiting, idle, or in_progress).
- **FR-002**: The system MUST only suppress ETA/progress when run status is "completed" (past the schedule window with all shifts ended).
- **FR-003**: The run status field MUST remain in the progress payload so that status badges on both driver and public pages continue to function.
- **FR-004**: The driver UI shift lifecycle (start/end shift, status badges) MUST remain unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a driver ends their shift, the public routes page shows ETA for that route within the next data refresh, provided the van has fresh tracking data and is within schedule.
- **SC-002**: Starting or ending a shift on one van does not affect the ETA display of any other van on the public page.
- **SC-003**: Driver UI status badges continue to correctly reflect shift state after the change.

## Assumptions

- "Fresh GPS data" follows the existing staleness threshold (10 minutes).
- The existing ETA computation logic is correct — only the condition that gates whether it is called needs to change.
- When no active shift exists, ETA computation uses current time as the time floor (existing fallback).
