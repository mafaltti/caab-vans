# Feature Specification: Multi-Driver Shift Support

**Feature Branch**: `024-multi-driver-shifts`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Multi-driver shift support for CAAB vans. A van has at least two drivers (one per shift) and drivers may be replaced. When Driver A ends their shift, Driver B must be able to start a new shift on the same route — the route is NOT done for the day."

## Clarifications

### Session 2026-03-02

- Q: Can two drivers have overlapping shifts on the same route? → A: No. One driver must end their shift before the next can start. Clean handoff with no concurrent active shifts.
- Q: What should passengers see between shifts? → A: Show schedule only — neutral state with no status banner. Passengers don't need to know about shifts.
- Q: How should drivers be assigned to a van? → A: Multiple drivers pre-assigned to a van by admin. Any assigned driver can start a shift when no active shift exists. No daily admin intervention needed.
- Q: How many shifts per day? → A: Unlimited. No hard cap — supports standard 2-shift pattern, replacements, and any edge cases.
- Q: What happens to stop progress (route_run_stops) across shift transitions? → A: Preserve all stop progress across shifts. A new shift adds to existing passed stops — geofence-based "passed" marks from earlier shifts remain visible and are not reset.
- Q: What happens to historical route_runs with started_at/ended_at data? → A: Migrate existing data into shift records (one shift per historical run with timestamps). Deprecate old columns on route_runs.
- Q: What happens to existing single-driver assignments (vans.driver_id)? → A: Migrate existing driver_id values into the new van–driver assignment records automatically. Drop the old column. Clean cutover, no legacy fallback.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver Starts a New Shift on a Previously-Ended Route (Priority: P1)

Driver B arrives for the afternoon shift. Driver A has already ended their morning shift. Driver B opens the app, sees the route as available (not locked as "completed"), and taps "Start Shift" to begin their working period. The system records Driver B's shift start and the public portal resumes showing live tracking for this route.

**Why this priority**: This is the core problem being solved. Without this, the second driver of the day is completely blocked — the system treats the route as done for the day after the first driver ends.

**Independent Test**: Log in as Driver B after Driver A has ended their shift. Verify the "Start Shift" button is available and that tapping it creates a new shift record. Verify the public portal transitions from schedule-only view back to live tracking.

**Acceptance Scenarios**:

1. **Given** Driver A has ended their shift on a route today, **When** Driver B (also assigned to the same van) views the driver page, **Then** they see the route as available with a "Start Shift" button — not as "completed for the day."
2. **Given** Driver B starts a shift, **When** the public portal polls for updates, **Then** the route transitions from schedule-only view to live tracking with ETA and next-stop information.
3. **Given** a shift is active, **When** the system computes progress, **Then** it uses the current shift's start time for stop filtering (stops scheduled before the shift start are skipped).

---

### User Story 2 - Admin Pre-Assigns Multiple Drivers to a Van (Priority: P1)

An administrator opens the van editing page and assigns two or more drivers to the van. These drivers are pre-assigned and can operate the van's route on any day without further admin action. The admin can also remove or replace drivers at any time.

**Why this priority**: Required for Story 1 to work — multiple drivers must be linked to a van so each can independently start and end shifts. Without this, admin must manually swap the single driver assignment at every shift change.

**Independent Test**: As an admin, open the van edit page, add two drivers, save. Verify both drivers appear as assigned. Log in as each driver and verify both can see the van's route.

**Acceptance Scenarios**:

1. **Given** an admin is editing a van, **When** they assign multiple drivers, **Then** all assigned drivers are saved and displayed on the van configuration.
2. **Given** a van has two assigned drivers, **When** either driver logs in, **Then** they see the van's route on their driver page.
3. **Given** an admin removes a driver from a van, **When** that driver logs in, **Then** they no longer see the van's route.
4. **Given** a driver is assigned to a van, **When** that driver has an active shift and the admin removes them, **Then** the active shift remains valid until the driver ends it (removal takes effect for future shifts only).

---

### User Story 3 - Driver Ends Their Shift (Priority: P1)

A driver finishes their working period and taps "End Shift." The system records the end time for this driver's shift. Critically, the route is NOT marked as completed for the day — it remains available for the next assigned driver to start a new shift.

**Why this priority**: Directly paired with Story 1. The end-shift action must not lock out subsequent drivers.

**Independent Test**: Start a shift as Driver A, then end it. Verify the route is not marked as "completed for the day." Verify Driver B can still start a new shift.

**Acceptance Scenarios**:

1. **Given** a driver has an active shift, **When** they tap "End Shift" and confirm, **Then** the system records the shift end time and the route remains available for new shifts.
2. **Given** a driver ends their shift, **When** they view the driver page, **Then** they see a summary of their completed shift (start/end times) but cannot start another shift themselves immediately (no overlap — they just ended).
3. **Given** a driver ends their shift and no other driver starts a new one, **When** a passenger views the route, **Then** the public portal shows the schedule only — no live tracking, no "route ended for today" banner.

---

### User Story 4 - Public Portal Between Shifts (Priority: P2)

A passenger views a route on the public portal during the gap between two driver shifts. Instead of seeing a misleading "route ended for today" message, they see a neutral schedule-only view — the same as when a route exists but has no active tracking data.

**Why this priority**: Improves passenger experience by not prematurely declaring the route as over for the day, but is not as critical as the driver-facing functionality.

**Independent Test**: End a shift as Driver A without Driver B starting. View the public route page and verify it shows the schedule without any "ended" or "active" status indicators.

**Acceptance Scenarios**:

1. **Given** a route's last shift has ended and no new shift is active, **When** a passenger views the route page, **Then** they see the schedule timeline without live tracking indicators, ETA, or "ended for today" messaging.
2. **Given** the route is between shifts, **When** the passenger views the route list, **Then** the route appears without an "active" or "ended" status badge — it shows as not currently tracked.
3. **Given** the route's schedule window has completely passed and all shifts have ended, **When** a passenger views the route, **Then** the route shows as ended for the day (same as current behavior for past-schedule routes).

---

### User Story 5 - Driver Page Shows Shift History (Priority: P3)

A driver views their route page and can see a summary of all shifts completed today — including shifts by other assigned drivers. This provides situational awareness of the route's daily operation.

**Why this priority**: Nice-to-have for driver awareness, but not essential for the core shift handoff functionality.

**Independent Test**: Complete two shifts with different drivers. Log in as either driver and verify the shift history shows both shifts with their respective start/end times and driver names.

**Acceptance Scenarios**:

1. **Given** two shifts have been completed today by different drivers, **When** a driver views the route page, **Then** they see a list of today's shifts with start/end times.
2. **Given** a shift is currently active, **When** the assigned driver views the route, **Then** they see the active shift highlighted and can end it, plus any prior completed shifts.

---

### User Story 6 - Fallback: GPS Pings Without Active Shift (Priority: P3)

GPS pings continue to be ingested regardless of shift status. If a driver sends GPS pings without starting a shift (e.g., they forgot), the existing time-aware filtering fallback continues to work for progress tracking.

**Why this priority**: Safety net — the existing Phase 1 fallback already handles this. Lower priority because drivers are expected to use the shift controls.

**Independent Test**: Send GPS pings for a route with no active shift. Verify pings are recorded and the time-aware fallback correctly identifies the next upcoming stop.

**Acceptance Scenarios**:

1. **Given** GPS pings arrive for a route with no active shift, **When** the system processes them, **Then** pings are ingested normally and the time-aware fallback provides progress estimates.
2. **Given** a shift is active and GPS pings arrive, **When** the system computes ETA, **Then** it uses the shift's start time (not the time-aware fallback) for stop filtering.

---

### Edge Cases

- What happens if a driver tries to start a shift while another driver's shift is already active? The system prevents it and shows a clear message indicating another driver is currently operating the route.
- What happens if a driver is removed from a van while they have an active shift? The active shift continues until the driver ends it. The removal takes effect for future shifts only.
- What happens if all assigned drivers are removed from a van? The route appears with no drivers available. GPS pings still work via the ingestion token. The time-aware fallback handles progress.
- What happens if a driver is assigned to multiple vans? Each van's route appears independently on the driver page. The driver can start shifts on different routes (one per route at a time).
- What happens at midnight if a shift spans the day boundary? The shift's start and end timestamps are absolute (not date-bound), so the shift continues naturally across midnight. The route run is tied to the service date when the shift was started.
- What happens if the same driver ends a shift and wants to start a new one (e.g., took a break)? Allowed — the driver can start a new shift on the same route as long as no other shift is currently active.
- What happens to existing historical route runs that have started_at/ended_at data? A data migration converts each into a corresponding shift record. The old columns are deprecated and no longer used by the application.
- What happens to existing single-driver assignments on vans? The migration automatically creates van–driver assignment records from existing driver_id values and drops the old column. No admin re-setup required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support assigning multiple drivers to a single van. All assigned drivers can see the van's route on their driver page.
- **FR-002**: System MUST allow any assigned driver to start a new shift on a route, provided no other shift is currently active on that route for the day.
- **FR-003**: System MUST prevent overlapping shifts — a new shift cannot be started while another is active on the same route.
- **FR-004**: When a driver ends their shift, the route MUST remain available for new shifts. Ending a shift MUST NOT mark the route as completed for the day.
- **FR-005**: The system MUST track each shift individually, recording which driver started it, when it started, and when it ended.
- **FR-006**: The public portal MUST show a neutral schedule-only view when a route is between shifts (no active shift, but schedule window not yet passed). No "ended for today" messaging.
- **FR-007**: The public portal MUST show the route as ended for the day only when the schedule window has fully passed and no shift is active.
- **FR-008**: When a shift is active, the progress-tracking system MUST use that shift's start time for stop filtering and ETA computation (stops before the shift start are skipped).
- **FR-009**: Stop progress records (passed stops) MUST be preserved across shift transitions within the same day. A new shift adds to the existing progress — earlier geofence-based "passed" marks are never reset.
- **FR-010**: GPS pings MUST continue to be ingested regardless of shift status (existing behavior preserved).
- **FR-011**: The admin van editing interface MUST allow adding and removing multiple drivers from a van.
- **FR-012**: Only drivers assigned to a van MUST be able to start or end shifts on that van's route. Unauthorized drivers MUST be denied access.
- **FR-013**: The driver page MUST show today's shift history for the route, including shifts by other assigned drivers.
- **FR-014**: The existing time-aware filtering fallback MUST remain functional when no explicit shift exists (GPS pings without a started shift).
- **FR-015**: A driver who ends a shift MUST be allowed to start a new shift on the same route later (e.g., after a break), provided no other shift is active.
- **FR-016**: Starting a shift on a route that has no daily run record yet MUST create the run record automatically.
- **FR-017**: The confirmation step before ending a shift MUST clearly communicate that only the current shift is ending, not the route for the day.
- **FR-018**: Existing historical route run data (started_at/ended_at) MUST be migrated into shift records during deployment. Each historical run with timestamps becomes one shift record, preserving continuity. The old timestamp columns on route runs are deprecated.
- **FR-019**: Existing single-driver assignments (vans.driver_id) MUST be migrated into the new van–driver assignment records automatically during deployment. The old driver_id column is dropped. No legacy fallback or dual-read logic.

### Key Entities

- **Shift**: A single driver's working period within a route's daily operation. Has a start time (required), an end time (set when the driver finishes), and a reference to the driver who operated it. Multiple shifts can exist per daily route run.
- **Van–Driver Assignment**: A many-to-many relationship between vans and drivers. Pre-configured by administrators. Determines which drivers can see and operate a van's route. Does not require daily updates.
- **Route Run**: Represents a single day's operation of a route (existing entity, unchanged). Now serves as a container for multiple shifts rather than having its own start/end timestamps.

## Assumptions

- The existing driver role and authentication system remain unchanged — drivers still log in with email/password.
- The existing Expo tracker app continues to send GPS pings via the ingestion token, completely unaware of shifts.
- A route still has a 1:1 relationship with a van (existing constraint preserved).
- The route schedule (schedule_entries) remains fixed and date-independent — shifts are the variable.
- There is no defined "shift schedule" (e.g., "Driver A works 06:00–14:00") — drivers start and end shifts manually when they physically begin and finish operating the van.
- Drivers are responsible for starting their own shifts. The system does not auto-assign or auto-start shifts.
- The admin user management page already supports creating users with the "driver" role (existing feature from spec 022).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A second driver can start a shift within 10 seconds of opening the app, after the previous driver has ended their shift — no admin intervention required.
- **SC-002**: The public portal never shows "route ended for today" while the schedule window is still open and the route could have more shifts.
- **SC-003**: Passengers see live tracking resume within 30 seconds of a new shift starting (via polling).
- **SC-004**: Administrators can pre-assign multiple drivers to a van in a single edit session, eliminating the need for daily driver swap operations.
- **SC-005**: ETA and next-stop accuracy is maintained across shift transitions — each shift correctly filters stops based on its own start time.
- **SC-006**: The system supports any number of shift transitions per day without errors or data inconsistencies.
