# Feature Specification: Driver Workflow V1

**Feature Branch**: `068-driver-workflow-v1`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Driver workflow V1 covering all four priorities from the driver workflow analysis (0112): active-route driver screen with navigation handoff, skip-stop exceptions with audit, deferred stop / rerank remaining stops, and public warning states for route exceptions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Active-Route Driver Screen (Priority: P1)

A driver starts their shift and needs to see what's happening right now: which stop is next, how late (or early) they are, where the stop is on a map, and a one-tap way to open navigation. Today the driver sees only a list of route cards with start/end buttons — no live context once the shift is running.

With this story, a driver who has started their shift taps into the active route and sees a "next stop hero" (stop name, scheduled time, ETA, delay badge), a map showing the van's position and upcoming stops, a scrollable list of all stops (passed shown as completed, upcoming shown as pending), a "Navegar" button that opens the next stop's coordinates in their phone's map app, tracker health indicators (last ping age, battery level, network type), and shift controls (end shift).

**Why this priority**: This is the highest-impact change because it transforms the driver area from a shift launcher into a live run console. It requires zero backend model changes and unblocks all other stories by providing the surface where exception actions will live.

**Independent Test**: Can be fully tested by starting a shift and verifying the active-route screen loads with real-time data (next stop, ETA, map, tracker health). Delivers immediate value to drivers who currently have no live context during their shift.

**Acceptance Scenarios**:

1. **Given** a driver has an active shift, **When** they tap on the route card, **Then** they see the active-route screen with next-stop hero, ETA/delay, map, stop list, and shift controls.
2. **Given** the active-route screen is open, **When** the driver taps "Navegar", **Then** the device opens a navigation app (Google Maps, Waze, or native maps) with the next stop's coordinates as the destination.
3. **Given** the active-route screen is open, **When** 5 seconds elapse, **Then** the screen auto-refreshes progress data (next stop, ETA, delay, passed stops, van position) without a full page reload.
4. **Given** a stop has been passed (via geofence or manual confirmation), **When** the driver views the stop list, **Then** the passed stop appears with a completed visual indicator and the next-stop hero updates to the following stop.
5. **Given** the tracker device has not sent a ping in more than 5 minutes, **When** the driver views the active-route screen, **Then** a tracker health warning is visible showing time since last ping.
6. **Given** the driver views tracker health, **When** battery level is below 20%, **Then** a low-battery warning is visible.
7. **Given** the driver is on the active-route screen, **When** they tap "Encerrar Turno", **Then** a confirmation dialog appears, and upon confirming, the shift ends and the screen returns to the route list.
8. **Given** no active shift exists for the route, **When** the driver tries to access the active-route screen, **Then** they are redirected to the route list.

---

### User Story 2 — Skip Current Next Stop with Reason and Audit (Priority: P2)

A driver encounters a situation where they cannot serve the next scheduled stop — road closure, no passengers, facility closed, etc. They need to skip that stop and continue to the following one, but the system must record why the skip happened and who did it.

Today the only stop statuses are "pending" and "passed". Skipping a stop is not possible — the contiguous-prefix model blocks all advancement until the head-of-line stop is resolved. This story extends the model to support a "skipped" status that counts as "resolved" for progression purposes, adds a skip action restricted to the current next stop only, and creates an immutable audit trail.

**Why this priority**: This is the core model change that enables all exception handling. Without it, drivers have no way to handle real-world deviations, forcing them to either wait or end their shift prematurely.

**Independent Test**: Can be tested by starting a shift, advancing to a mid-route stop, then skipping the current next stop with a reason. Verify the following stop becomes the new next stop, the skipped stop appears with a distinct visual indicator and reason, and the audit log records the event.

**Acceptance Scenarios**:

1. **Given** a driver has an active shift and a pending next stop, **When** they choose "Pular proxima parada" from the exception menu, **Then** the system presents a list of reason options and an optional free-text note field.
2. **Given** the driver has selected a reason, **When** they confirm the skip, **Then** the current next stop's status changes to "skipped", the reason and note are recorded, the driver's identity and timestamp are logged, and the next-stop hero advances to the following pending stop.
3. **Given** a stop has been skipped, **When** the driver views the stop list, **Then** the skipped stop appears with a distinct "Pulada" badge and the reason is visible.
4. **Given** a driver attempts to skip a stop that is not the current next stop, **Then** the system rejects the action — only the head-of-line pending stop can be skipped.
5. **Given** a stop has been skipped, **When** the tracking system receives a geofence event for the next pending stop, **Then** progression advances normally — the skipped stop does not block advancement.
6. **Given** multiple stops have been skipped in a run, **When** the route is viewed, **Then** all skipped stops are visible with their individual reasons, and the ETA reflects only the remaining pending stops.
7. **Given** a stop has been skipped, **Then** it cannot be un-skipped or reverted to pending by the driver — the action is final in V1.
8. **Given** any stop is skipped, **Then** an immutable event is written to the run event log with: event type, stop identifier, actor, reason code, optional note, and timestamp.

---

### User Story 3 — Detour Mode with Reason and Audit (Priority: P2)

A driver needs to deviate from the planned route — construction, accident, or other road condition. The system should record that the route is in detour mode so that operations and passengers are aware.

**Why this priority**: Complements skip-stop by covering route-level deviations (not stop-specific). Shares the same audit infrastructure.

**Independent Test**: Can be tested by entering detour mode with a reason, verifying the route is flagged as deviating, then exiting detour mode. The audit log records both events.

**Acceptance Scenarios**:

1. **Given** a driver has an active shift, **When** they choose "Entrar em desvio" from the exception menu, **Then** the system requires a reason and optionally a note before activating detour mode.
2. **Given** detour mode is active, **When** the driver views the active-route screen, **Then** a visible "Em desvio" indicator is displayed.
3. **Given** detour mode is active, **When** the driver chooses "Sair do desvio", **Then** detour mode is deactivated and the indicator disappears.
4. **Given** detour mode is entered or exited, **Then** an immutable event is written to the run event log with event type, actor, reason, and timestamp.
5. **Given** the driver ends their shift while in detour mode, **Then** detour mode is automatically deactivated with a "shift_ended" reason logged.

---

### User Story 4 — Deferred Stop / Return Later (Priority: P3 — Future, not in this branch)

> **Implementation note**: This story is documented for completeness and future planning but is **out of scope** for the 068-driver-workflow-v1 branch. It will be implemented as a separate feature after skip-stop (P2) is stable in production. See Clarifications section.

A driver skips a stop but intends to return to it later in the run — for example, a stop that temporarily has no access but will reopen. Instead of marking it permanently skipped, the driver marks it as "deferred" so the system keeps it in the remaining work queue.

**Why this priority**: This is a model extension beyond simple skip. It requires a separate "execution order" for remaining stops so the system knows when to revisit the deferred stop. The 0112 analysis explicitly recommends deferring this until skip-stop is stable.

**Independent Test**: Can be tested by deferring a stop, verifying progression continues past it, then manually confirming the deferred stop later in the run. The stop transitions from "deferred" to "passed".

**Acceptance Scenarios**:

1. **Given** a driver has an active shift and a pending next stop, **When** they choose "Adiar parada" from the exception menu, **Then** the system requires a reason, marks the stop as "deferred", and advances to the following pending stop.
2. **Given** a stop is deferred, **When** the driver views the stop list, **Then** the deferred stop appears with a distinct "Adiada" badge and its position in the remaining execution order is visible.
3. **Given** a stop is deferred, **When** the driver later arrives at that stop's geofence, **Then** the system transitions the stop from "deferred" to "passed" via normal geofence processing.
4. **Given** a stop is deferred, **When** the driver chooses "Confirmar parada manualmente" for that stop, **Then** the stop transitions from "deferred" to "passed" with a manual confirmation source.
5. **Given** a stop is deferred, **When** the driver ends their shift without resolving it, **Then** the deferred stop remains in "deferred" status with an audit event noting it was unresolved at shift end.
6. **Given** deferred stops exist, **When** the ETA is computed, **Then** the ETA reflects the current execution order (deferred stops are excluded from the immediate path until their turn comes).

---

### User Story 5 — Public Warning States for Route Exceptions (Priority: P4)

Passengers viewing the public route page need to know when a route is deviating from its planned schedule — stops have been skipped, the driver entered detour mode, or stops are deferred. Without this, the public app presents a clean planned route while operations are explicitly deviating.

**Why this priority**: This is a passenger-trust feature. It has the lowest implementation effort (frontend-only once the exception data flows through the API) but depends on the skip-stop and detour features being in place.

**Independent Test**: Can be tested by skipping a stop or entering detour mode as a driver, then viewing the public route page and verifying the warning indicators appear.

**Acceptance Scenarios**:

1. **Given** a route has one or more skipped stops, **When** a passenger views the route list, **Then** a warning badge is visible on that route indicating schedule deviations.
2. **Given** a route has skipped stops, **When** a passenger views the route detail, **Then** skipped stops appear with a "Pulada" indicator and an explanatory label (e.g., "Parada pulada pelo motorista").
3. **Given** a route is in detour mode, **When** a passenger views the route detail, **Then** a banner is visible at the top stating the route is deviating with the provided reason.
4. **Given** a route has deferred stops, **When** a passenger views the route detail, **Then** deferred stops appear with an "Adiada" indicator.
5. **Given** a route has exceptions, **When** the ETA is displayed, **Then** a caveat note is shown: "Tempo estimado pode variar — parada(s) com alteracao."
6. **Given** a route has no exceptions, **When** a passenger views the route, **Then** no warning indicators appear — the display is identical to today.

---

### Edge Cases

- What happens when a driver skips all remaining stops? The route should be considered effectively complete (no more pending stops). The run status should reflect "completed" if the schedule window has passed.
- What happens when a geofence event arrives for a stop that was already skipped? The event is dropped — a skipped stop cannot transition back to "passed" in V1.
- What happens when the tracker goes offline during a skip action? The skip is a server-side API call independent of GPS tracking. It succeeds or fails based on server reachability, not tracker status.
- What happens when two drivers have overlapping shifts and one tries to skip? Only the driver with the currently active shift can perform exception actions. The system enforces shift ownership.
- What happens when a deferred stop's geofence fires while the van passes through en route to another stop? The geofence match transitions the deferred stop to "passed" — this is the simplest and most predictable behavior.
- What happens when the driver's browser loses connectivity during the active-route screen? The auto-refresh pauses and a connectivity warning appears. Data resumes on reconnection. No stale data is presented as current.
- How does manual stop confirmation interact with skipped stops? A driver cannot manually confirm a stop that has been skipped. Manual confirmation applies only to pending or deferred stops.

## Requirements *(mandatory)*

### Functional Requirements

**Active-Route Screen (P1)**

- **FR-001**: System MUST provide a dedicated active-route view accessible when a driver has a running shift, showing the current next stop, ETA, delay, map, stop list, tracker health, and shift controls.
- **FR-002**: System MUST auto-refresh route progress data at a regular interval (target: every 5 seconds) without requiring manual reload.
- **FR-003**: System MUST provide a navigation handoff action ("Navegar") that opens the next stop's coordinates in the device's default navigation app.
- **FR-004**: System MUST display tracker health indicators: time since last ping, battery level, and network type.
- **FR-005**: System MUST display a tracker health warning when the last ping is older than 5 minutes or battery is below 20%.
- **FR-006**: System MUST display all stops in a scrollable list with visual distinction between passed, pending, and skipped statuses.

**Skip-Stop Exception (P2)**

- **FR-007**: System MUST support a "skipped" status on stops, distinct from "pending" and "passed".
- **FR-008**: System MUST allow a driver to skip only the current next stop (head-of-line), not arbitrary stops.
- **FR-009**: System MUST require a reason code when skipping a stop, selected from a predefined list (e.g., road closure, no passengers, facility closed, vehicle issue, other).
- **FR-010**: System MUST accept an optional free-text note when skipping a stop.
- **FR-011**: System MUST record the skipping driver's identity and timestamp with each skip action.
- **FR-012**: System MUST treat skipped stops as "resolved" for progression purposes — skipped stops do not block advancement of subsequent stops.
- **FR-013**: System MUST NOT allow a skipped stop to revert to "pending" in V1 — skip is final.
- **FR-014**: System MUST update the ETA to reflect only remaining pending stops after a skip.

**Detour Mode (P2)**

- **FR-015**: System MUST support a route-level "detour" state that can be toggled on/off by the driver with the active shift. Detour mode is informational only — it does not pause or alter geofence-based stop advancement.
- **FR-016**: System MUST require a reason when entering detour mode, selected from a predefined list (e.g., road closure, accident, construction, police checkpoint, other). The "other" option unlocks a free-text field — same pattern as skip reasons.
- **FR-017**: System MUST automatically deactivate detour mode when the driver's shift ends.

**Audit Trail (P2)**

- **FR-018**: System MUST record an immutable event for every exception action: stop skipped, detour entered, detour exited, and (in P3) stop deferred.
- **FR-019**: Each audit event MUST include: event type, affected stop (if applicable), actor identity, reason code, optional note, and timestamp.
- **FR-020**: Audit events MUST NOT be editable or deletable by any user role.

**Deferred Stops (P3 — Future, not in this branch)**

- **FR-021**: *(Future)* System MUST support a "deferred" status on stops, meaning "skip now, return later."
- **FR-022**: *(Future)* System MUST allow a deferred stop to be resolved later via geofence detection or manual confirmation.
- **FR-023**: *(Future)* System MUST maintain an execution order for remaining stops that differs from the planned sequence when deferred stops exist.
- **FR-024**: *(Future)* System MUST allow only the current next stop to be deferred (same head-of-line rule as skip).
- **FR-025**: *(Future)* System MUST record unresolved deferred stops at shift end as an audit event.

**Public Warning States (P4)**

- **FR-026**: System MUST display a warning badge on the public route list when a route has skipped, deferred, or detoured status.
- **FR-027**: System MUST display individual stop exception indicators (skipped, deferred) on the public route detail schedule timeline.
- **FR-028**: System MUST display a detour banner on the public route detail when detour mode is active.
- **FR-029**: System MUST display an ETA caveat note when exceptions exist on the route.
- **FR-030**: System MUST NOT display any warning indicators when no exceptions exist — the public experience is unchanged from today.

### Key Entities

- **Route Run Stop Exception**: Extension of existing stop tracking — adds status ("skipped", "deferred"), reason code, free-text note, acting driver identity, and action timestamp.
- **Route Run Event**: Immutable audit record tied to a route run — event type, affected stop (optional), actor, reason, note, flexible metadata, and creation timestamp.
- **Route Run Exception State**: Route-level flags indicating whether the run has skipped stops, deferred stops, is in detour mode, and/or has an exception note describing the current deviation.

## Clarifications

### Session 2026-03-11

- Q: Is P3 (Deferred Stops) in scope for this feature branch? → A: No — P3 is documented future work only. This branch implements P1 (active-route screen) + P2 (skip-stop, detour, audit) + P4 (public warnings). Deferred stops will be a separate feature after skip-stop is stable in production.
- Q: Does detour mode affect stop progression, or is it purely informational? → A: Informational only. Detour is a display/audit flag; geofence-based stop advancement continues normally while detour is active.
- Q: Should detour reasons use a predefined list or free-text? → A: Predefined list with an "Outro" (other) option that unlocks a free-text field — same structured pattern as skip reasons, keeping audit data queryable while handling edge situations.

## Assumptions

- The web driver area remains the primary operational surface. The Expo tracker app continues as a background tracking tool only.
- Navigation handoff uses standard URI schemes (`geo:` or Google Maps URL) — no custom in-app navigation.
- Reason codes for skip/defer are a fixed predefined list managed in code, not a dynamic admin-configurable list (V1 simplicity).
- The 5-second polling interval for auto-refresh matches the existing public route detail page behavior.
- Tracker health data (battery, network, ping age) is already available from the latest van location ping record — no new device-side work is needed.
- "Deferred" stops in P3 will use a separate execution sequence rather than modifying the planned stop sequence, to preserve the integrity of the planned schedule.
- Parcel-delivery features (signatures, photos, barcode scans, client portals) are explicitly out of scope per the 0112 analysis.
- Arbitrary drag-and-drop stop resequencing by drivers is explicitly out of scope — only "skip current" and "defer current" are allowed.

## Scope Exclusions

- No changes to the Expo tracker app.
- No offline-first or service-worker support for the driver web area (V1 assumes connectivity).
- No admin dashboard for viewing audit logs (data is stored; admin UI is a future feature).
- No "pause/resume" shift action (listed in 0112 exception drawer but deferred beyond V1).
- No manual stop confirmation from the exception drawer (uses the existing cold-start confirmation flow).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Drivers can view live route progress (next stop, ETA, map) within 2 seconds of opening the active-route screen.
- **SC-002**: Drivers can skip the current next stop in under 15 seconds (open menu, select reason, confirm).
- **SC-003**: After a stop is skipped, the next-stop hero and ETA update within one auto-refresh cycle (5 seconds).
- **SC-004**: 100% of skip and detour actions produce an immutable audit event with actor, reason, and timestamp.
- **SC-005**: Passengers see warning indicators on routes with exceptions within one refresh cycle of the public page.
- **SC-006**: Navigation handoff ("Navegar") opens the device's map app with the correct destination coordinates on first tap.
- **SC-007**: Tracker health warnings appear within one refresh cycle when the device ping is stale (>5 min) or battery is low (<20%).
- **SC-008**: The public route page shows zero visual changes for routes with no exceptions — no false positives.
