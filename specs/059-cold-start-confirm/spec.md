# Feature Specification: Cold-Start Stop Confirmation

**Feature Branch**: `059-cold-start-confirm`
**Created**: 2026-03-10
**Status**: Draft
**Input**: User description: "Mid-route cold start — driver confirmation on shift start"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-Tap Confirmation of Current Stop (Priority: P1)

A driver starts a shift well after the route's first scheduled stop (e.g., 2+ hours late). The system detects this is a cold start, guesses which stop the driver is currently near using GPS and schedule time, and presents a confirmation prompt. The driver confirms with a single tap, and all earlier stops are immediately marked as passed. The public route view instantly shows the correct next stop.

**Why this priority**: This is the core value — eliminates the cold-start gap that causes the UI to show the wrong next stop (e.g., showing CAAB 06:10 when the van is at Comércio 08:20). Without this, drivers who start late always trigger the stale-first-stop bug until a geofence fires.

**Independent Test**: Start a shift 2+ hours into the schedule with GPS near a mid-route stop. Verify the confirmation prompt appears with the correct suggested stop, confirm it, and check that the public route view shows the correct next stop.

**Acceptance Scenarios**:

1. **Given** a driver starts a shift 30+ minutes after the first scheduled stop and the route run has zero passed stops, **When** the shift is started with GPS position available, **Then** the system presents a confirmation prompt suggesting the stop closest in time and within 2km of the driver.
2. **Given** the confirmation prompt shows a suggested stop, **When** the driver taps confirm, **Then** all chronologically earlier stops are marked as passed and the confirmed stop becomes the next stop.
3. **Given** the confirmation prompt shows a suggested stop, **When** the driver taps confirm, **Then** the public route view immediately reflects the correct next stop.

---

### User Story 2 - Alternative Stop Selection (Priority: P2)

The system's guess is wrong (e.g., the driver is at a different stop than suggested). The driver can pick from a short list of alternative stops instead of confirming the top suggestion.

**Why this priority**: The guess may be incorrect due to GPS imprecision or unusual circumstances. Providing alternatives ensures the driver can always set the correct position without dismissing the entire feature.

**Independent Test**: Start a shift mid-route, see the suggestion prompt, select an alternative stop from the list, and verify that stops before the selected alternative are marked as passed.

**Acceptance Scenarios**:

1. **Given** the confirmation prompt is displayed, **When** the driver selects an alternative stop from the list, **Then** all stops before the selected stop are marked as passed and the selected stop becomes the next stop.
2. **Given** the confirmation prompt is displayed, **Then** the alternatives list shows up to 4 additional stops beyond the top suggestion.

---

### User Story 3 - Dismiss Confirmation (Priority: P2)

The driver chooses to skip the confirmation entirely. The system falls back to the existing geofence-based progression behavior.

**Why this priority**: Some drivers may prefer not to interact with the prompt, or may not understand it. The feature must be non-blocking — dismissing must not cause any data issues.

**Independent Test**: Start a shift mid-route, dismiss the confirmation prompt, and verify that geofence-based progression works normally as the van moves.

**Acceptance Scenarios**:

1. **Given** the confirmation prompt is displayed, **When** the driver taps "Pular" (skip), **Then** the prompt is dismissed and no stops are marked as passed.
2. **Given** the driver dismissed the prompt, **When** the van enters a geofence, **Then** normal stop progression (geofence + backfill) operates as it does today.

---

### User Story 4 - No Confirmation When Not Needed (Priority: P3)

The system does not show the confirmation prompt when it is unnecessary: when the driver starts on time (within threshold of first stop), when the route run already has progress from a prior shift, or when the route has no stop coordinates.

**Why this priority**: Avoiding unnecessary prompts reduces friction for drivers who start on time and prevents confusion on resumed shifts.

**Independent Test**: Start a shift on time (within 30 minutes of first stop) and verify no confirmation prompt appears. Start a second shift on a route that already has passed stops and verify no prompt appears.

**Acceptance Scenarios**:

1. **Given** a driver starts a shift within 30 minutes of the first scheduled stop, **When** the shift starts, **Then** no confirmation prompt is shown.
2. **Given** a route run already has passed stops from a prior shift, **When** a new shift is started, **Then** no confirmation prompt is shown.
3. **Given** a route has no schedule entries with coordinates, **When** a shift is started mid-route, **Then** no confirmation prompt is shown.

---

### Edge Cases

- What happens if GPS pings arrive and geofence-match a stop before the driver confirms? The system rejects the confirmation if any geofence-based passes already exist (conflict).
- What happens if the driver confirms the wrong stop? Self-correcting — geofence matching and backfill will naturally advance past the confirmed stop as the van moves.
- What happens if the driver confirms, then retries the same confirmation? Idempotent — same stop returns success with no changes.
- What happens if the driver tries to confirm a different stop after already confirming one? Rejected — the run already has passed stops.
- What happens if no GPS is available from the browser and no recent van ping exists? The system shows a time-only list of plausible stops (no top suggestion highlighted), capped at 5 stops.
- What happens if the confirm request arrives before the first GPS ping (stops not yet seeded)? The confirmation process seeds the stops itself before processing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect a cold-start condition when a shift is started and all of the following are true: (a) the route run has zero passed stops, (b) current time is 30+ minutes past the first scheduled stop time.
- **FR-002**: System MUST generate a stop suggestion using a two-pass algorithm: first filter stops within 2km of the driver's GPS position, then rank by closest scheduled time to current time (only stops where scheduled_time <= now + 30min).
- **FR-003**: System MUST include the cold-start suggestion (top stop + up to 4 alternatives) in the shift start response when a cold-start condition is detected.
- **FR-004**: System MUST accept GPS coordinates (latitude/longitude) from the client when starting a shift.
- **FR-005**: System MUST provide a confirmation action that marks all chronologically earlier stops as passed when the driver confirms a stop.
- **FR-006**: The confirmation action MUST validate that the confirmed stop belongs to the route, the driver has an active shift, and the run has zero passed stops (cold-start invariant).
- **FR-007**: The confirmation action MUST be idempotent — confirming the same stop twice returns success with no changes.
- **FR-008**: The confirmation action MUST reject with conflict if the run already has geofence-based passes or any passed stops (from a prior confirm or prior shift).
- **FR-009**: The confirmation action MUST seed route run stops if they have not been created yet.
- **FR-010**: Confirmed stops MUST be marked with pass source "manual" and confidence 0.85.
- **FR-011**: The confirmation action MUST re-run canonical prefix enforcement after marking stops to ensure data consistency.
- **FR-012**: System MUST fall back to time-only ranking (no proximity filter, capped at 5 stops, no highlighted suggestion) when no GPS position is available from either the browser or a recent van ping (within 5 minutes).
- **FR-013**: System MUST NOT show the confirmation prompt when the route has no schedule entries with coordinates.
- **FR-014**: The driver dashboard MUST display a confirmation modal after shift start showing the suggested stop with confirm, alternative selection, and dismiss options.
- **FR-015**: Dismissing the confirmation MUST have zero side effects — no stops marked, normal geofence progression takes over.

### Key Entities

- **Cold-Start Suggestion**: A ranked set of candidate stops (top suggestion + alternatives) generated from the driver's GPS position and current time, returned alongside the shift start response.
- **Stop Confirmation**: A driver action that bulk-marks all chronologically earlier stops as passed with manual pass source, establishing the correct next stop immediately.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a driver starts a shift mid-route and confirms the suggested stop, the correct next stop is displayed on the public route view within 3 seconds of confirmation.
- **SC-002**: The system's top stop suggestion matches the driver's actual current stop in at least 80% of mid-route cold starts (when GPS is available).
- **SC-003**: Driver confirmation requires at most one tap when the suggestion is correct, or two taps (select alternative + confirm) when it is not.
- **SC-004**: Zero data corruption incidents — confirmation never creates non-contiguous stop progressions or conflicts with geofence-based passes.
- **SC-005**: The confirmation prompt appears only for true cold starts — no false positives on on-time starts or resumed shifts.

## Assumptions

- The 30-minute threshold for "late start" detection is appropriate for the current route schedules. This can be tuned without structural changes.
- The 2km proximity filter radius is sufficient to disambiguate stops along the routes. This is configurable.
- A 5-minute freshness limit on van pings is reasonable for fallback GPS positioning.
- Browser geolocation is available on most driver devices when starting a shift from the web app.
- The existing "manual" pass source value in the data model is sufficient — no schema changes are needed.
- Confidence value of 0.85 for manual confirmation is appropriate (above backfill, below multi-ping geofence).
