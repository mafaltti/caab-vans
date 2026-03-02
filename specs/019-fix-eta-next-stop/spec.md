# Feature Specification: Fix ETA & Next Stop Time-Awareness

**Feature Branch**: `019-fix-eta-next-stop`
**Created**: 2026-03-01
**Status**: Draft
**Input**: Fix the ETA and next stop bug where mid-route GPS activation causes the system to pick the earliest pending stop (e.g., CAAB @ 00:00) instead of the correct upcoming stop.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct Next Stop in Schedule Timeline (Priority: P1)

A passenger opens the route detail page while a van is actively sharing GPS location mid-route (e.g., the van started sharing at 22:00 on a route that runs from 00:00 to 23:40). The schedule timeline should highlight the correct upcoming stop based on current time, not the earliest un-geofenced stop from earlier in the day.

**Why this priority**: This is the core bug — passengers see misleading information (wrong stop, ~0 min ETA) which undermines trust in the tracking system.

**Independent Test**: Can be tested by viewing a route with active GPS tracking that started mid-day. The timeline should show the correct current stop with a realistic ETA.

**Acceptance Scenarios**:

1. **Given** a route with a full-day schedule (00:00–23:40) and GPS tracking started at 22:00, **When** a passenger views the route at 22:35, **Then** the schedule timeline shows the correct next upcoming stop (the first stop with scheduled time >= 22:35) as "current" with a blue indicator.
2. **Given** morning stops (00:00, 00:20, 00:40, etc.) that were never geofenced, **When** the system determines the next stop, **Then** those past-time stops are classified as "past" in the timeline, not "future" or "current".
3. **Given** GPS tracking is active and some stops have been geofenced as "passed", **When** the timeline renders, **Then** geofenced stops show as "past" AND un-geofenced stops whose scheduled time is before now also show as "past".

---

### User Story 2 - Correct ETA Computation (Priority: P1)

The ETA displayed for the next stop should reflect the actual upcoming stop, not a past-time stop clamped to 0 minutes. The hero card and schedule timeline should agree on the next stop identity.

**Why this priority**: A 0-minute ETA for a stop 22 hours in the past is confusing and incorrect. The hero card already shows the right stop; the ETA system must match.

**Independent Test**: Can be tested by comparing ETA values returned by the API with manually calculated expected values for a mid-day tracking scenario.

**Acceptance Scenarios**:

1. **Given** a van is at 22:35 and the next scheduled stop is at 22:40, **When** the ETA is computed, **Then** the ETA is approximately 5 minutes (adjusted for delay if applicable), not 0 minutes.
2. **Given** all remaining pending stops have scheduled times in the past, **When** the ETA is computed, **Then** the result indicates route completion (null ETA) rather than 0 minutes.
3. **Given** the hero card shows "Mundo Plaza @ 22:40" as next stop, **When** the schedule timeline renders, **Then** it also shows "Mundo Plaza @ 22:40" as the current stop (both components agree).

---

### User Story 3 - Hero Card ETA Display (Priority: P2)

When the GPS-based next stop matches the time-based next stop (which it will after this fix), the hero card should display the ETA value.

**Why this priority**: Currently the hero card hides ETA because the GPS-based and time-based next stop IDs differ. Once they agree, the ETA should appear.

**Independent Test**: Can be tested by confirming the hero card renders the ETA badge when GPS tracking is active and the next stop IDs match.

**Acceptance Scenarios**:

1. **Given** GPS tracking is active and the time-aware next stop matches the time-based next stop, **When** the hero card renders, **Then** the ETA minutes are displayed in the hero card.

---

### Edge Cases

- **Route spanning midnight (23:00 to 01:00)**: Time comparison must handle wraparound so that 01:00 is treated as "after" 23:00, not "before".
- **Van stops tracking mid-day and resumes later**: Stops in the gap period are treated as "past" by the time filter — no incorrect "current" assignment.
- **No GPS tracking data at all**: The system falls back to pure time-based next stop logic (existing behavior, no regression).
- **All stops geofenced perfectly**: No behavior change — already works correctly.
- **GPS tracking active but no stops geofenced yet**: The time-aware filter still correctly picks the upcoming stop, not the earliest pending one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The ETA computation MUST filter pending stops to only those whose scheduled time is at or after the current time before selecting the next stop.
- **FR-002**: The stop progress inference MUST apply the same time-aware filter when determining the next stop ID in its result, so that past-time pending stops are not selected as "next".
- **FR-003**: The schedule timeline MUST classify un-geofenced stops with scheduled time before now as "past" when GPS tracking data exists, using a hybrid approach: a stop is "past" if GPS confirmed it passed OR its scheduled time is before the current time.
- **FR-004**: The timeline MUST only mark a stop as "current" if it is the inferred next stop AND its scheduled time is at or after the current time.
- **FR-005**: Time comparisons MUST handle routes that span midnight defensively, treating post-midnight times as later than pre-midnight times within the same route context.
- **FR-006**: The fix MUST NOT require any database migration or schema change.
- **FR-007**: The fix MUST NOT change behavior when no GPS tracking data exists (pure time-based fallback must continue to work).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a van starts GPS tracking mid-route, the schedule timeline displays the correct next upcoming stop (matching the hero card) in 100% of cases.
- **SC-002**: ETA values are always positive and realistic when a future stop exists, never clamped to 0 minutes for a past-time stop.
- **SC-003**: The hero card and schedule timeline agree on the next stop identity, enabling the hero card to display the ETA value.
- **SC-004**: Existing behavior for routes without GPS tracking remains unchanged (no regression).
- **SC-005**: Routes spanning midnight correctly identify the next stop without time comparison errors.

## Assumptions

- The current time used for filtering is server time in the America/Bahia timezone, consistent with the rest of the application.
- Midnight-spanning routes are an edge case to handle defensively but are not the primary use case.
- The server already provides a `serverTime` field in the API response (or it will be added as part of this fix) for the timeline component to use for consistent time comparison.
- No changes to the data model or API contract shape are needed beyond potentially passing server time to the frontend.
