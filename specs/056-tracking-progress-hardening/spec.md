# Feature Specification: Tracking Progress Hardening

**Feature Branch**: `056-tracking-progress-hardening`
**Created**: 2026-03-08
**Status**: Draft
**Input**: Harden tracking progress: enforce adjacency for persisted stop pointers, make confidence scoring deterministic, propagate includeLastKnown consistently, and render overdue ETA state in UI

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Next-Stop Display Under Degraded GPS (Priority: P1)

A commuter viewing a running route always sees the correct next stop, even when the van's GPS signal is intermittent or weak. The system never skips ahead to a non-adjacent stop; if it cannot confidently determine progress, it falls back gracefully rather than displaying a misleading stop or ETA.

**Why this priority**: Displaying the wrong next stop (e.g., stop 6 when the van just passed stop 3) directly misleads commuters and erodes trust in the tracking system. This is the most user-visible defect.

**Independent Test**: Can be tested by simulating a route where only stop 3 is confirmed passed with low confidence (<= 0.7), then verifying the system does not show stop 6 as next — it shows stop 4 (the true next stop) or indicates uncertainty.

**Acceptance Scenarios**:

1. **Given** a running route where stop 3 was passed and stops 4-5 remain pending, **When** the system detects stop 6 with low confidence and skips backfill, **Then** the next stop displayed to commuters is stop 4 (first pending in order), not stop 6.
2. **Given** a running route where stop 3 was passed with high confidence (>0.7), **When** backfill marks stops 4 and 5 as passed, **Then** the next stop displayed is stop 6 and the ETA reflects accumulated travel from stop 3.
3. **Given** a persisted next-stop pointer that points to a non-adjacent stop, **When** the resolver evaluates that pointer, **Then** the pointer is rejected and the system falls back to schedule-based ETA rather than using the non-adjacent pointer.

---

### User Story 2 - Deterministic ETA Under Varying Ping Volume (Priority: P1)

A commuter checking the same route multiple times in quick succession sees the same ETA and next-stop information each time. The confidence calculations that drive progress detection produce the same result regardless of database row ordering or ping volume fluctuations.

**Why this priority**: Flickering ETA or next-stop information (changing on each refresh) confuses commuters and undermines confidence in the system.

**Independent Test**: Can be tested by running the stop-inference function twice with the same data window and verifying that confidence values, backfill decisions, and resulting progress pointers are identical.

**Acceptance Scenarios**:

1. **Given** a van with 60 recent pings in the confidence window, **When** the system evaluates stop passage twice in quick succession, **Then** both evaluations produce the same confidence value and backfill decision.
2. **Given** pings with identical timestamps, **When** the system queries recent pings, **Then** the result set is deterministically ordered (by a stable tiebreaker) and capped at a predictable size.

---

### User Story 3 - Overdue Stop Shown as Overdue, Not "Arriving Now" (Priority: P2)

A commuter viewing a late-running route sees an "overdue" or "delayed" indicator when the van should have already arrived at the next stop, instead of a misleading "ETA: ~0 min" message.

**Why this priority**: Showing "0 min" when the van is late is misleading — the commuter may assume the van is about to arrive when it could still be far away. Correct status communication helps commuters make informed decisions.

**Independent Test**: Can be tested by setting up a route where the segment ETA computes an arrival time in the past, then verifying the UI shows an overdue indicator instead of "0 min".

**Acceptance Scenarios**:

1. **Given** a running route where the computed segment ETA is 5 minutes in the past, **When** a commuter views the route, **Then** the route card displays an overdue/delayed indicator instead of "ETA: ~0 min".
2. **Given** a running route where the computed ETA is 1 minute in the future, **When** a commuter views the route, **Then** the route card displays "ETA: ~1 min" (not "0 min").

---

### User Story 4 - Last-Known Progress Consistent Across Response Fields (Priority: P2)

A commuter or integrating client using `includeLastKnown=true` sees consistent information: if the progress section includes a next stop, the top-level route summary also reflects that stop. There are no responses where nested progress reports a stop but the top-level summary is null.

**Why this priority**: Inconsistent API responses force clients to guess which field to trust, leading to UI bugs and confused users.

**Independent Test**: Can be tested by querying a non-running route with `includeLastKnown=true` and verifying that top-level `nextStop` matches `progress.nextStopId` (both populated or both null).

**Acceptance Scenarios**:

1. **Given** a completed route with persisted progress pointers, **When** queried with `includeLastKnown=true`, **Then** the top-level `nextStop` and `currentStopIndex` match the `progress.nextStopId` value.
2. **Given** a route in waiting state with no prior progress, **When** queried with `includeLastKnown=true`, **Then** both top-level `nextStop` and `progress.nextStopId` are null.

---

### Edge Cases

- What happens when all stops have been passed but the route is still marked as running (no end-shift call)? → Out of scope; handled by the existing orphaned-shift reconciliation script.
- What happens when the van's GPS produces pings with identical timestamps (tiebreaker ordering)?
- What happens when OSRM distance data is missing for intermediate stops in the segment ETA calculation?
- What happens when the confidence window contains zero pings (van offline)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce adjacency when persisting progress pointers — `nextStopId` must be the first chronologically pending stop after `lastPassedStopId`, with no pending gaps between them.
- **FR-002**: System MUST reject persisted next-stop pointers that are non-adjacent to the last passed stop when resolving route progress for display.
- **FR-003**: System MUST query recent pings with a deterministic ordering that includes a stable tiebreaker and an explicit row cap.
- **FR-004**: System MUST produce identical confidence values and backfill decisions when evaluated against the same data window, regardless of concurrent database activity.
- **FR-005**: System MUST display an overdue or delayed indicator to users when the estimated arrival time for the next stop is in the past, instead of showing "0 min" or "arriving now".
- **FR-006**: System MUST ensure that when `includeLastKnown=true` is used, the top-level route summary fields (`nextStop`, `currentStopIndex`) are consistent with the nested progress fields — either both populated or both null.
- **FR-007**: System MUST NOT populate `progress.nextStopId` for routes in waiting state when `includeLastKnown=true`, since no progress has occurred.

### Key Entities

- **Progress Pointer**: A persisted reference (`lastPassedStopId`, `nextStopId`) on a route run that indicates where the van is in its stop sequence. Must satisfy adjacency: no pending stops may exist between the last passed and next stop.
- **Pass Confidence**: A numeric score (0.0–1.0) representing how certain the system is that a van passed a specific stop. Drives the backfill decision (threshold: >0.7). Must be deterministic for a given data window.
- **ETA Status**: The state of an arrival estimate — "estimated" (future arrival), "overdue" (arrival time has passed), or absent (no estimate available). Drives UI rendering.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The next stop shown to commuters is always the first pending stop in chronological order after the last confirmed stop — zero instances of non-adjacent pointer display.
- **SC-002**: Repeated route progress queries within the same data window produce identical results 100% of the time.
- **SC-003**: When a van is late and the estimated arrival is in the past, 100% of route displays show an overdue indicator instead of "0 min".
- **SC-004**: API responses with `includeLastKnown=true` have zero inconsistencies between top-level summary and nested progress fields.
- **SC-005**: All existing tracking tests continue to pass after changes (no regressions).

## Assumptions

- The existing confidence threshold of >0.7 for backfill is correct and does not need adjustment.
- The existing reconciliation script for orphaned shifts (already implemented) is sufficient — automatic shift closure is out of scope for this feature.
- The OSRM distance data model and segment ETA calculation logic are structurally correct; only the edge-case handling (overdue clamping, non-adjacent pointers) needs fixing.
- The route card component is the primary UI surface for ETA display; other consumers of the ETA data will benefit from the backend fixes without separate UI changes.

## Scope Boundary

### In Scope

- Adjacency enforcement for progress pointers (write-time and read-time)
- Deterministic ping query ordering and capping
- Overdue ETA rendering in the route card UI
- `includeLastKnown` response consistency fix

### Out of Scope

- Automatic shift reconciliation (already implemented separately)
- Snapped-match confidence recalibration beyond what the deterministic query fix addresses
- Database-level geofence filtering optimizations
- New ETA algorithms or speed model changes
