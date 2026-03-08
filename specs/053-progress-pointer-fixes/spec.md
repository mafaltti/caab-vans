# Feature Specification: Progress Pointer Correctness Fixes

**Feature Branch**: `053-progress-pointer-fixes`
**Created**: 2026-03-08
**Status**: Implemented
**Input**: Fix P1/P2 gaps from Phase 2 progress pointer gap analysis (doc 0086): segment ETA, legacy default, stale pointer regression, snap decision, confidence source, backfill gate, non-active state suppression.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Accurate ETA When Van Is Running Late (Priority: P1)

A passenger checks the app while waiting for a van that is running behind schedule. The van has already passed several stops and is approaching a stop that is two or more stops ahead of the last confirmed passage. The passenger sees a realistic ETA rather than "0 minutes" or no ETA at all.

**Why this priority**: ETA accuracy is the core value proposition. A clamped-to-zero or missing ETA directly erodes passenger trust and makes the app unreliable during the moments it matters most — when the van is late.

**Independent Test**: Can be tested by simulating a route where the van passes stop A, skips stop B, and the persisted pointer targets stop C. Verify the displayed ETA reflects the actual remaining distance (A→B→C), not just the A→B segment distance.

**Acceptance Scenarios**:

1. **Given** a running route where the last passed stop is A and the persisted pointer targets stop C (two stops ahead), **When** the system computes ETA via segment fallback, **Then** the ETA reflects the cumulative distance from A through B to C, not just the A→B segment distance.
2. **Given** a running route where the van has fresh GPS, **When** the system computes ETA, **Then** the GPS-based ETA path is used (no change to current behavior).

---

### User Story 2 — Persisted Pointer Is the Active Progress Source (Priority: P1)

An operator deploys the system. Without needing to set any special environment variable, the progress API serves ETA and next-stop data from the persisted pointer (written by the ingestion pipeline) rather than the legacy time-floor algorithm.

**Why this priority**: The persisted pointer was built to replace the legacy algorithm. As long as the legacy path remains the default, passengers see the less-accurate legacy ETA even though the system is already computing and storing better data.

**Independent Test**: Deploy the system with no `TRACKING_PROGRESS_SOURCE` env var set. Verify the progress API returns ETA based on the persisted pointer, not the legacy time-floor selection.

**Acceptance Scenarios**:

1. **Given** no `TRACKING_PROGRESS_SOURCE` environment variable is set, **When** the progress API resolves route progress, **Then** the persisted pointer path is used.
2. **Given** `TRACKING_PROGRESS_SOURCE=legacy` is explicitly set, **When** the progress API resolves route progress, **Then** the legacy path is used (opt-in backward compatibility).
3. **Given** `TRACKING_PROGRESS_SOURCE=shadow` is set, **When** the progress API resolves route progress, **Then** shadow mode computes both and serves legacy (no change to shadow behavior).

---

### User Story 3 — Stale Pointer Does Not Erase a Valid Overdue Stop (Priority: P1)

A van is running 35+ minutes late. The persisted pointer expires (exceeds the staleness threshold). The system falls back to legacy ETA selection, but the legacy algorithm filters out all overdue stops, producing no ETA at all. Instead, the system should preserve the pointed stop as long as it is still pending.

**Why this priority**: This regression path silently removes all progress information for late-running routes — the exact scenario where passengers need ETA most.

**Independent Test**: Create a route run where the pointer is 35 minutes old and all pending stops are past their scheduled time. Verify the system still returns a valid next stop and ETA.

**Acceptance Scenarios**:

1. **Given** a running route with a stale pointer (age > staleness threshold) where the pointed stop is still pending, **When** the system resolves progress, **Then** the pointed stop is still used as the next stop target.
2. **Given** a running route with a stale pointer where the pointed stop has already been marked as passed, **When** the system resolves progress, **Then** the system falls back to the next available pending stop by route order (not by time-floor filtering).
3. **Given** a running route with a fresh pointer, **When** the system resolves progress, **Then** behavior is unchanged (pointer is used directly).
4. **Given** a running route where all remaining stops are past their scheduled time and no valid pointer exists, **When** the system computes ETA, **Then** the system still returns a valid ETA and next stop by route order rather than null.

---

### User Story 4 — Stop-Specific Snap Decision for Mixed Road/Campus Stops (Priority: P2)

A route includes both road-based stops (where OSRM snapping is accurate) and campus/depot stops (where snapping can place the van on a distant road). The system evaluates snapped vs raw GPS independently for each stop rather than making a single global decision per ping.

**Why this priority**: Improves accuracy for routes with mixed stop types, but the current global-snap approach is already safer than the old split and handles most cases acceptably.

**Independent Test**: Simulate a ping where raw-to-snapped displacement is 40m. One stop is on the road (snapped is closer), another is in a campus parking lot (raw is closer). Verify each stop's geofence check uses the coordinate source that produces the shortest distance to that stop.

**Acceptance Scenarios**:

1. **Given** a ping with snapped coordinates within the displacement threshold, **When** evaluating a road-based stop, **Then** the snapped position is used for the geofence check.
2. **Given** the same ping, **When** evaluating an off-road campus stop where raw GPS is closer to the stop, **Then** the raw position is used for that stop's geofence check.
3. **Given** a ping where snapped coordinates exceed the displacement threshold, **When** evaluating any stop, **Then** raw GPS is used for all stops (no change to fallback behavior).

---

### User Story 5 — Confidence Evidence Matches Passage Source (Priority: P2)

When the system marks a stop as passed via snapped coordinates, the confidence score is based on evidence from the same coordinate source. A snapped passage does not receive a "high confidence" label backed only by raw pings that may be meters away.

**Why this priority**: Prevents misleading confidence scores that could allow incorrect backfill decisions. Lower priority because the current behavior is conservative (raw pings are a stricter evidence bar).

**Independent Test**: Trigger a snapped geofence passage and verify the confidence query uses snapped coordinates, or that the confidence scaling explicitly accounts for the coordinate-source mismatch.

**Acceptance Scenarios**:

1. **Given** a stop passage detected via snapped coordinates, **When** calculating confidence, **Then** the confidence evidence uses coordinates consistent with the passage source.
2. **Given** a stop passage detected via raw coordinates, **When** calculating confidence, **Then** raw pings are used for the confidence query (no change).

---

### User Story 6 — Tighter Backfill Gate for Single-Stop Gaps (Priority: P2)

A van triggers a low-confidence geofence match at a stop with a one-stop gap behind it. The system does not automatically backfill the skipped stop unless the triggering passage has sufficient confidence (multi-ping evidence or snapped source).

**Why this priority**: Prevents one noisy GPS reading from auto-advancing two stops at once. The current gate already prevents large-gap backfill; this tightens the single-stop case.

**Independent Test**: Simulate a single raw ping at stop B (confidence 0.7) with stop A still pending (gap = 1). Verify stop A is NOT backfilled. Then simulate the same scenario with 2+ raw pings (confidence 0.9). Verify stop A IS backfilled.

**Acceptance Scenarios**:

1. **Given** a geofence match with confidence <= 0.7 and a one-stop gap, **When** the backfill gate is evaluated, **Then** backfill is NOT performed.
2. **Given** a geofence match with confidence > 0.7 and a one-stop gap, **When** the backfill gate is evaluated, **Then** backfill IS performed.
3. **Given** a geofence match with any confidence and zero gap, **When** stop advancement is evaluated, **Then** the matched stop is advanced normally (no backfill needed).

---

### User Story 7 — Last Known Progress for Completed/Paused Runs (Priority: P3)

After a route run completes or a driver pauses, the system can optionally return the last known progress state (passed stops, final next stop, last ETA) rather than suppressing all progress data.

**Why this priority**: Currently no product requirement drives this, but the data exists in the database and may be useful for post-run review or brief driver pauses.

**Independent Test**: Complete a route run, then query progress with the opt-in flag. Verify the response includes the last known passed stops and next stop from the run.

**Acceptance Scenarios**:

1. **Given** a completed route run, **When** progress is queried with the opt-in parameter, **Then** the response includes last known passed stops, next stop, and final ETA.
2. **Given** a completed route run, **When** progress is queried without the opt-in parameter, **Then** the response returns null/empty progress (current behavior preserved).
3. **Given** an actively running route, **When** progress is queried with or without the opt-in parameter, **Then** behavior is unchanged (live progress is always returned).

---

### Edge Cases

- What happens when a route has only one stop remaining and the segment distance is missing? The system falls back to schedule-based ETA.
- What happens when the pointer targets a stop that was removed from the schedule mid-run? The system treats the pointer as invalid and falls back to the next pending stop by route order.
- What happens when OSRM is unavailable and multi-segment distance accumulation cannot be computed? The system falls back to schedule-based ETA gracefully.
- What happens when a van's GPS is stale AND the pointer is stale simultaneously? The system uses the pointer's target stop (if still pending and pointer age < 2 hours) with schedule-based ETA.
- What happens when the pointer is extremely old (> 2 hours) but the stop is still pending? The system treats the pointer as invalid (likely stuck pipeline) and falls back to the next pending stop by route order.
- What happens when all stops on the route are already passed? The route transitions to completed state with no ETA.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accumulate segment distances across intermediate stops when the persisted pointer targets a non-successor stop, producing an ETA that reflects the actual remaining route distance. If any intermediate segment is missing its precomputed distance, the system MUST fall back entirely to schedule-based ETA (no partial accumulation).
- **FR-002**: System MUST use the persisted progress pointer as the default progress source when no `TRACKING_PROGRESS_SOURCE` environment variable is configured.
- **FR-003**: System MUST preserve the `legacy` and `shadow` progress modes as opt-in alternatives via explicit environment variable configuration.
- **FR-004**: System MUST NOT discard a stale persisted pointer when the pointed stop is still pending, up to an absolute ceiling of 2 hours. Beyond 2 hours, the system MUST treat the pointer as invalid and fall back to the next pending stop by route order. Within the 2-hour window, the system MUST continue using the pointed stop as the ETA target.
- **FR-005**: System MUST fall back to the next pending stop by route order (not by time-floor filtering) when the stale pointer's target stop has already been passed.
- **FR-006**: System MUST evaluate the snap-vs-raw GPS decision independently per candidate stop, using whichever coordinate source places the van closer to that specific stop (within the displacement threshold).
- **FR-007**: System MUST use coordinate evidence consistent with the passage source when calculating stop-passage confidence, or explicitly adjust confidence scores to account for the coordinate-source mismatch.
- **FR-008**: System MUST require confidence > 0.7 for single-stop backfill (gap = 1), removing the unconditional `gap <= 1` exception.
- **FR-009**: System MUST support an opt-in mechanism to return last known progress for completed, idle, or waiting route runs.
- **FR-010**: System MUST fall back to schedule-based ETA when multi-segment distance data is unavailable (missing OSRM data or OSRM service unavailable).

### Key Entities

- **Progress Pointer**: A persisted reference (`next_stop_id`, `progress_updated_at`) written by the ingestion pipeline indicating the system's best estimate of which stop the van is approaching next.
- **Segment Distance**: The precomputed road distance (`osrm_distance_m`) from one stop to its immediate successor, stored on each schedule entry.
- **Passage Confidence**: A numeric score (0.0–1.0) indicating how reliable a geofence-based stop passage detection is, based on recent ping density within the stop's geofence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Routes where the van is 30+ minutes late display a valid ETA and next stop to passengers 100% of the time (currently fails when all stops are overdue).
- **SC-002**: ETA accuracy for non-successor target stops improves measurably — segment fallback uses cumulative distance instead of single-segment distance.
- **SC-003**: The persisted progress pointer is the active default for all new deployments without requiring manual environment variable configuration.
- **SC-004**: False backfill rate for single-stop gaps decreases — single noisy raw ping no longer auto-passes the previous stop.
- **SC-005**: All existing unit tests continue to pass, and new tests cover each corrected behavior.
- **SC-006**: No regression in progress resolution performance — computation completes within existing time bounds.

## Clarifications

### Session 2026-03-08

- Q: What happens when some intermediate stops have `osrm_distance_m` and others don't during multi-segment accumulation? → A: Fall back entirely to schedule-based ETA if any intermediate segment distance is missing (no partial accumulation).
- Q: Should there be an absolute ceiling on stale pointer trust when the stop is still pending? → A: Yes, 2-hour absolute ceiling. Beyond 2 hours, treat the pointer as invalid and fall back to next pending stop by route order.

## Assumptions

- The OSRM precompute script already stores per-segment distances on each schedule entry. Multi-segment accumulation can sum these existing values.
- The `shadow` mode will continue to be available for operators who want to compare legacy vs persisted behavior before fully committing.
- The staleness threshold (currently 30 minutes) remains configurable but the behavior when a pointer expires changes (prefer pointer target over time-floor fallback).
- Per-stop snap evaluation (Story 4) may increase computation per ping proportionally to the number of candidate stops. This is acceptable given typical route sizes (5–15 stops).
- The opt-in parameter for completed/paused run progress (Story 7) is additive and does not change default API behavior.

## Scope Boundaries

**In scope**:
- Fixing the 3 P1 gaps (segment ETA, default mode, stale pointer regression)
- Fixing the 3 P2 gaps (snap decision, confidence source, backfill gate)
- Adding the P3 opt-in completed-run progress

**Out of scope**:
- Changing the staleness threshold value itself (remains 30 minutes)
- Adding end-to-end integration tests (identified as a residual gap but treated as a separate effort)
- Modifying the OSRM precompute script (existing segment distances are sufficient)
- Adding stop-type metadata (campus vs road) to the data model
