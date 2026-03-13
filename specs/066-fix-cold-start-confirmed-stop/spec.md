# Feature Specification: Fix Cold-Start Confirmed Stop Stuck Pending

**Feature Branch**: `066-fix-cold-start-confirmed-stop`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Fix mid-route cold-start: mark confirmed stop as passed so progression unblocks"

## Problem Statement

When a driver starts their shift mid-route (cold start) and confirms their current stop via the confirm-start-stop flow, all **prior** stops are correctly marked as `passed`. However, the **confirmed stop itself** remains `pending` and becomes the `next_stop_id`.

Since the van is already physically at or past the confirmed stop, no device geofence "enter" event will fire for it (geofence events only trigger on outside-to-inside transitions). The only stop progression mechanism in the tracking pipeline is device geofence events, so the confirmed stop stays `pending` indefinitely. This blocks the head-of-line guard, preventing all subsequent stops from advancing.

**Impact**: Commuters see a stale "next stop" for the remainder of the day. The route appears frozen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver Cold-Starts and Progression Resumes (Priority: P1)

A driver forgot to start their shift and taps "Iniciar turno" mid-route (e.g., at 10:00 when the first stop departed at 06:45). The system detects a cold start and presents stop suggestions. The driver picks the stop they are currently at. After confirmation, the system marks that stop (and all prior stops) as passed, so the next pending stop is the one the van will travel to next. Subsequent geofence events advance stops normally.

**Why this priority**: This is the core fix. Without it, the entire route is broken for the rest of the day after any cold start.

**Independent Test**: Confirm a mid-route start stop and verify that `next_stop_id` points to the stop **after** the confirmed one, and that device geofence events for subsequent stops are processed normally.

**Acceptance Scenarios**:

1. **Given** a cold-start shift where the driver confirms stop #7, **When** the confirmation is processed, **Then** stops 1-6 are marked `passed` with `pass_source='manual'` AND stop #7 is also marked `passed` with `pass_source='manual'`, AND `next_stop_id` points to stop #8.
2. **Given** a confirmed cold-start where stop #7 was marked passed, **When** the van arrives at stop #8 and a device geofence enter event fires, **Then** stop #8 is the head-of-line pending stop, and it is marked `passed` with `pass_source='device_geofence'`.
3. **Given** a cold-start confirmation, **When** the response is returned to the driver app, **Then** the response reflects the updated `nextStopId` (stop #8), `lastPassedStopId` (stop #7), and correct `passedCount`.

---

### User Story 2 - Commuters See Accurate Next Stop After Cold Start (Priority: P1)

Commuters checking the app after a driver cold-starts mid-route see the correct upcoming stop (the one the van is heading toward), not the stop the van is already at or past.

**Why this priority**: This is the user-facing consequence of the bug. Commuters rely on "next stop" to decide when to head to their pickup point.

**Independent Test**: After a cold-start confirmation, query the route status and verify the displayed next stop is the one after the confirmed stop.

**Acceptance Scenarios**:

1. **Given** a driver confirmed cold-start at stop #7 at 10:00, **When** a commuter views the route at 10:01, **Then** the next stop shown is stop #8 (not stop #7).
2. **Given** a driver confirmed cold-start at stop #7, **When** the van later passes stop #8 via geofence, **Then** the commuter sees stop #9 as the next stop.

---

### Edge Cases

- What happens if the driver confirms the **last stop** in the schedule? All stops should be marked `passed`, and `next_stop_id` should be `null` (route complete).
- What happens if the driver confirms the **first stop** (no prior stops to mark)? Only that stop is marked `passed`; `next_stop_id` becomes stop #2.
- What happens if the confirm endpoint is called **twice** with the same stop? The operation is idempotent — second call returns success without re-marking.
- What happens if geofence events arrived for some stops **before** the cold-start confirmation? The existing conflict guard (409 response) prevents re-marking, preserving geofence-based passes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a driver confirms their current stop during a cold-start, the system MUST mark the confirmed stop as `passed` in addition to all prior pending stops.
- **FR-002**: The confirmed stop MUST be marked with `pass_source='manual'` and `pass_confidence=0.85`, consistent with how prior stops are marked.
- **FR-003**: After marking the confirmed stop as passed, the system MUST update `next_stop_id` to point to the stop immediately after the confirmed stop (by sequence order).
- **FR-004**: The confirm endpoint response MUST reflect the updated `nextStopId`, `lastPassedStopId`, and `passedCount` including the confirmed stop.
- **FR-005**: If the confirmed stop is the last stop in the schedule, `next_stop_id` MUST be set to `null`.
- **FR-006**: The existing idempotency behavior MUST be preserved — re-confirming the same stop returns success without side effects.
- **FR-007**: The existing conflict guard (409 when stops have geofence-based `pass_source`) MUST remain unchanged.

### Key Entities

- **route_run_stops**: Row for the confirmed stop transitions from `pending` to `passed` during confirmation (in addition to prior stops).
- **route_runs**: `next_stop_id` and `last_passed_stop_id` pointers are updated to reflect the confirmed stop as the last passed stop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a cold-start confirmation, commuters see the correct next stop (the one after the confirmed stop) within the same request cycle — no delay or waiting for geofence events.
- **SC-002**: All stops after a cold-start confirmation continue to advance normally via device geofence events, with zero blocked stops.
- **SC-003**: Existing non-cold-start shift starts (normal flow where driver starts on time) are unaffected — no behavioral change for the standard path.
- **SC-004**: The confirm endpoint remains idempotent — duplicate calls produce the same result without errors.

## Assumptions

- The driver confirming "I'm at stop X" means that stop is effectively served (passengers have been picked up or the van is departing). This is a reasonable default because the cold-start scenario implies the van has already been operating; the driver just forgot to start the digital shift.
- The `pass_confidence=0.85` value for manually confirmed stops is appropriate and consistent with existing behavior for prior stops.
- No UI changes are needed in the driver app — the response contract already includes `nextStopId` and `lastPassedStopId`, which will now reflect the correct values.

## Scope Boundary

**In scope**: Modifying the confirm-start-stop endpoint to include the confirmed stop in the set of stops marked as `passed`.

**Out of scope**:
- Changes to device geofence event processing logic.
- Changes to the cold-start detection or suggestion algorithm.
- UI changes in the driver or commuter apps.
- Changes to the normal (non-cold-start) shift start flow.
