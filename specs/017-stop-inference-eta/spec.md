# Feature Specification: Stop Inference, ETA Computation & Tracking UI

**Feature Branch**: `017-stop-inference-eta`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Stop inference, ETA computation, and tracking UI: implement stop inference V1 module using simple proximity detection, haversine distance helper, schedule-shifted ETA computation. Wire inference into tracking endpoint. Extend public API with progress data. Update admin and public UI. Add unit tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Stop Detection (Priority: P1)

As the system processes location pings from a van, it automatically detects when the van has passed a scheduled stop by checking if the van's coordinates are within the stop's geofence radius. This enables real-time progress tracking without any manual input from the driver.

**Why this priority**: Stop detection is the foundational capability — ETA, progress display, and all downstream features depend on knowing which stops have been passed.

**Independent Test**: Can be fully tested by sending location pings near known stop coordinates and verifying that the corresponding stops are marked as passed in the database.

**Acceptance Scenarios**:

1. **Given** a van has a route with stops that have lat/lng coordinates, **When** a location ping arrives within a stop's geofence radius (default 50m), **Then** that stop is marked as "passed" with a timestamp.
2. **Given** a van has a route with stops, **When** a location ping arrives outside all stop geofences, **Then** no stop status changes occur.
3. **Given** a stop has already been marked as "passed", **When** the van enters its geofence again, **Then** no duplicate transition occurs — the stop remains "passed".
4. **Given** a stop has no lat/lng coordinates configured, **When** a location ping arrives, **Then** that stop is skipped entirely (no inference attempted).
5. **Given** inference logic encounters an unexpected error, **When** processing a ping, **Then** the ping is still accepted and stored — inference failure does not block ingestion.

---

### User Story 2 - Estimated Time of Arrival (Priority: P1)

As a passenger viewing a route, I want to see an estimated arrival time for the next stop so I can plan when to be ready. The ETA is computed by measuring how delayed the van is (based on the last passed stop) and shifting the next stop's scheduled time by that delay.

**Why this priority**: ETA is the primary user-facing value of the tracking system — it transforms raw location data into actionable information for passengers.

**Independent Test**: Can be tested by setting up a route run with a known passed stop and timestamp, then verifying the computed ETA matches the expected schedule-shifted value.

**Acceptance Scenarios**:

1. **Given** the last passed stop was 5 minutes late (passed at 08:35, scheduled at 08:30), **When** the next stop is scheduled at 08:45, **Then** the ETA is 08:50 (shifted by +5 minutes).
2. **Given** no stops have been passed yet for today's run, **When** requesting ETA, **Then** the ETA equals the next stop's scheduled time (zero delay assumed).
3. **Given** all stops have been passed, **When** requesting ETA, **Then** ETA is null (route complete).

---

### User Story 3 - Progress Data in Route API (Priority: P1)

As the web application, I need the route API responses to include live tracking progress (which stops are passed, ETA, delay) alongside existing schedule data so the UI can display real-time route status.

**Why this priority**: The API is the bridge between backend inference and frontend display. Without it, no UI feature can show tracking data.

**Independent Test**: Can be tested by creating a route run with stop statuses, then calling the routes API and verifying the response includes the progress object with correct fields.

**Acceptance Scenarios**:

1. **Given** a route has tracking data for today, **When** the public routes API is called, **Then** the response includes a `progress` object with service date, passed stop IDs, next stop ID, ETA, and delay.
2. **Given** a route has no tracking data for today, **When** the public routes API is called, **Then** `progress` is `null` and existing schedule-based behavior is unchanged.
3. **Given** a van has recent location data, **When** the routes API is called, **Then** the van object includes `lastLat` and `lastLng` coordinates.
4. **Given** existing API consumers, **When** the response shape is extended, **Then** all existing fields remain unchanged — the new fields are purely additive.

---

### User Story 4 - Admin Configures Stop Coordinates (Priority: P2)

As an admin, I want to set latitude and longitude for each stop in the schedule editor so the system can detect when a van reaches that stop. These fields are optional — stops without coordinates simply skip inference.

**Why this priority**: Admin UI is needed to populate the stop coordinates that inference depends on, but the system degrades gracefully without them.

**Independent Test**: Can be tested by opening the schedule editor, entering lat/lng for a stop, saving, and verifying the values persist.

**Acceptance Scenarios**:

1. **Given** I am editing a schedule entry in the admin panel, **When** I enter latitude and longitude values, **Then** the values are saved and displayed on next load.
2. **Given** I am adding a new schedule entry, **When** I leave latitude and longitude empty, **Then** the entry is created successfully with null coordinates.
3. **Given** I enter an invalid latitude (e.g., 999), **When** I try to save, **Then** a validation error is shown.

---

### User Story 5 - Passengers See ETA in Route Detail (Priority: P2)

As a passenger viewing a route's detail page, I want to see the estimated arrival time for the next stop displayed prominently, along with visual indicators of which stops have already been passed.

**Why this priority**: This is the primary passenger-facing output of the tracking system, but depends on all backend stories being complete.

**Independent Test**: Can be tested by loading a route detail page for a route with active tracking data and verifying ETA is displayed and passed stops are visually marked.

**Acceptance Scenarios**:

1. **Given** a route is running and has tracking data with an ETA available, **When** I view the route detail page, **Then** I see the estimated arrival time and approximate minutes on the hero card.
2. **Given** a route is running and has tracking data, **When** I view the schedule timeline, **Then** passed stops show a completed visual state and the next inferred stop is highlighted.
3. **Given** a route has no tracking data, **When** I view the route detail page, **Then** the existing schedule-based display is shown (no ETA, index-based stop progress).

---

### User Story 6 - Passengers See ETA on Route List (Priority: P3)

As a passenger browsing the route list, I want to see a brief ETA indication on each running route's card so I can quickly assess timing without opening the detail page.

**Why this priority**: A nice-to-have enhancement that surfaces ETA earlier in the user journey, but the detail page already provides this information.

**Independent Test**: Can be tested by loading the route list page with a route that has active tracking and verifying the ETA line appears on the route card.

**Acceptance Scenarios**:

1. **Given** a route is running and has an ETA available, **When** I view the route list, **Then** the route card shows an ETA estimate below the next stop line.
2. **Given** a route has no ETA data, **When** I view the route list, **Then** no ETA line is shown — existing display is unchanged.

---

### User Story 7 - Unit Test Coverage (Priority: P1)

As a developer, I need unit tests for the core tracking logic (distance calculation, stop inference, ETA computation) to ensure correctness and prevent regressions.

**Why this priority**: These are pure functions with well-defined inputs/outputs — critical to test because bugs here affect all passengers and are hard to detect manually.

**Independent Test**: Tests run via the existing test framework and validate mathematical correctness of distance calculations, state transitions of stop inference, and arithmetic of ETA computation.

**Acceptance Scenarios**:

1. **Given** two known coordinate pairs, **When** computing distance, **Then** the result matches expected values within acceptable tolerance.
2. **Given** a set of stops and a ping location, **When** running inference, **Then** exactly the correct stops are marked as passed.
3. **Given** a delay value and next stop scheduled time, **When** computing ETA, **Then** the result matches the expected shifted time.

---

### Edge Cases

- What happens when a van has multiple routes? Only the route whose schedule window includes the current time is considered for inference.
- What happens when the service date rolls over at midnight Bahia time? A new route run is created for the new date; yesterday's run is unaffected.
- What happens when the device timestamp is significantly different from server time? The endpoint already handles future timestamps (>24h → fallback to now). Inference uses server time for `passed_at`.
- What happens when two stops are very close together (overlapping geofences)? Both are marked as passed if the ping is within both radii — acceptable for V1.
- What happens when stop coordinates are updated after a route run has started? Inference uses current coordinates; previously passed stops are not re-evaluated.
- What happens when the van backtracks through a previously passed stop? No change — once passed, a stop stays passed for that day's run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute geographic distance between two coordinate pairs using the haversine formula.
- **FR-002**: System MUST detect when a van is within a stop's geofence radius and mark the stop as "passed" with a timestamp.
- **FR-003**: System MUST create a daily route run record on first ping of each day per route, with all stops initialized as "pending".
- **FR-004**: System MUST compute ETA for the next stop by shifting its scheduled time by the delay observed at the last passed stop.
- **FR-005**: System MUST return ETA as null when all stops are passed (route complete).
- **FR-006**: System MUST return scheduled time as ETA when no stops have been passed yet (zero delay).
- **FR-007**: System MUST execute stop inference as a best-effort side effect of ping ingestion — inference failures MUST NOT block ping storage.
- **FR-008**: System MUST expose tracking progress (passed stops, next stop, ETA, delay) in route API responses when data exists for today.
- **FR-009**: System MUST expose van's latest coordinates in route API responses.
- **FR-010**: System MUST preserve all existing route API response fields unchanged — new tracking fields are additive only.
- **FR-011**: Admin users MUST be able to set latitude and longitude for each schedule entry via the admin panel.
- **FR-012**: Admin latitude/longitude fields MUST be optional — entries without coordinates are valid.
- **FR-013**: System MUST validate latitude (-90 to 90) and longitude (-180 to 180) on admin input.
- **FR-014**: Public UI MUST display estimated arrival time on the route detail page when tracking data with ETA is available.
- **FR-015**: Public UI MUST visually distinguish passed stops from pending stops on the schedule timeline when tracking data is available.
- **FR-016**: Public UI MUST fall back to existing schedule-based display when no tracking data is available.
- **FR-017**: Public UI MUST display ETA on route list cards when available.
- **FR-018**: System MUST have unit tests for distance calculation, stop inference state transitions, and ETA computation.
- **FR-019**: System MUST skip inference for schedule entries that have no coordinates configured.
- **FR-020**: System MUST use `America/Bahia` timezone for all date comparisons (service date, schedule times).

### Key Entities

- **Route Run**: A daily instance of a route being actively tracked. Links a route to a specific service date. Created automatically on first ping of the day.
- **Route Run Stop**: The tracking status of an individual stop within a route run. Transitions from "pending" to "passed" when the van enters the stop's geofence. Includes timestamp of passage.
- **Stop Geofence**: The geographic boundary around a scheduled stop, defined by latitude, longitude, and radius. Used for proximity-based detection.
- **ETA**: Estimated time of arrival at the next unpassed stop, computed by shifting the scheduled time by the observed delay at the last passed stop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Stops are correctly detected as "passed" when the van is within the configured geofence radius, with zero false negatives for pings clearly within radius.
- **SC-002**: ETA accuracy is within the precision of the schedule-shift model — the computed delay matches actual delay at the last passed stop.
- **SC-003**: Tracking progress is available in API responses within the same request cycle as the ping that triggered the stop transition.
- **SC-004**: All existing API consumers continue to work without modification — no breaking changes to response shapes.
- **SC-005**: Inference processing does not noticeably increase ping ingestion response time (stays best-effort, non-blocking).
- **SC-006**: Passengers see ETA information on the route detail page when a van is actively running with tracking data.
- **SC-007**: Admin users can configure stop coordinates for any schedule entry in under 1 minute per stop.
- **SC-008**: Unit tests cover distance calculation, inference transitions, and ETA computation with 100% of defined test cases passing.
- **SC-009**: System handles the full expected ping volume (~1,200 pings/hour per van) without errors.
- **SC-010**: When no tracking data is available, the user experience is identical to the current behavior — no degradation.

## Assumptions

- The geofence radius default of 50 meters is sufficient for urban stop detection. No admin UI for editing radius in V1 — uses the database default.
- A single ping within the geofence is enough to mark a stop as passed (no dwell timer or hysteresis needed for V1).
- Schedule-shifted delay (linear shift from last passed stop) is an acceptable ETA model for fixed urban van routes.
- Each van is assigned to at most one route. If a van has multiple routes, the system uses the route whose schedule window includes the current time.
- The `set_updated_at()` trigger function already exists in the database (created in migration 00001).
- Stop coordinates will be manually entered by admins. No geocoding or map picker in V1.
