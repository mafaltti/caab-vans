# Feature Specification: Fix ETA Segment Distance After Stop Skip

**Feature Branch**: `073-fix-eta-segment-skip`
**Created**: 2026-03-16
**Status**: Draft
**Input**: Bug analysis from `docs/execution/0118-eta-segment-skip-bug.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate ETA When Stops Are Skipped (Priority: P1)

A commuter is tracking a van that has skipped one or more stops along its route. When the system falls back to segment-based ETA (because GPS data is stale), the displayed ETA must reflect the actual road distance between the last passed stop and the next pending stop — not the pre-computed distance to the now-skipped neighbor.

**Why this priority**: This is the core bug. When stops are skipped, the ETA uses a drastically wrong distance (e.g., 1.1 km instead of ~6 km), producing an ETA that may already be in the past the moment it is calculated. Every commuter who views a route with skipped stops is affected.

**Independent Test**: Can be tested by simulating a route where a stop between two others is skipped, then verifying the segment ETA recalculates using the correct cumulative distance to the next pending stop.

**Acceptance Scenarios**:

1. **Given** stop #14 is skipped and the last passed stop is #13, **When** segment-based ETA is calculated for the next pending stop #15, **Then** the distance used is the actual road distance from #13 to #15 (not the pre-stored distance from #13 to #14).
2. **Given** multiple consecutive stops are skipped (e.g., #14 and #15), **When** segment-based ETA is calculated for stop #16, **Then** the distance used is the cumulative actual road distance from the last passed stop to #16.
3. **Given** no stops are skipped, **When** segment-based ETA is calculated, **Then** behavior is unchanged — the existing pre-stored OSRM distance is used as before.

---

### User Story 2 - Graceful Handling of Past-Due Segment ETA (Priority: P1)

A commuter views a route where the segment-based ETA has already fallen into the past, but the scheduled arrival time is still in the future. Instead of seeing "0 min" (which is misleading), the system should fall back to the schedule-based ETA or show an appropriate overdue/recalculating state.

**Why this priority**: This bug directly degrades user trust. Displaying "0 min" when the van is clearly not at the stop is confusing and makes the ETA feature appear broken. This is a separate code path from the distance bug and can occur independently (e.g., traffic delay without skips).

**Independent Test**: Can be tested by simulating a scenario where the computed segment ETA is in the past but the scheduled time is still in the future, then verifying the system does not display "0 min".

**Acceptance Scenarios**:

1. **Given** the segment ETA resolves to a time in the past and the scheduled time is still in the future, **When** the ETA is displayed, **Then** the system falls back to the schedule-based ETA instead of clamping to 0.
2. **Given** both the segment ETA and the scheduled time are in the past, **When** the ETA is displayed, **Then** the system correctly marks the stop as overdue (existing behavior, unchanged).
3. **Given** the segment ETA resolves to a time in the future, **When** the ETA is displayed, **Then** the segment ETA is used as-is (existing behavior, unchanged).

---

### Edge Cases

- What happens when all remaining stops after the last passed stop are skipped? The system should handle the empty-segment case gracefully (no pending stops to compute ETA for).
- What happens when the first stop on a route is skipped? The segment calculation should still use valid distances from the route origin.
- What happens when OSRM data is unavailable for the recalculated segment? The system should fall back to haversine or schedule-based estimation.
- What happens when multiple non-consecutive stops are skipped (e.g., #14 skipped, #15 pending, #16 skipped)? Each segment should independently use the correct distance to its actual next pending neighbor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When computing segment-based ETA, the system MUST use the road distance between the last passed stop and the actual next pending stop, recalculating if any intermediate stops were skipped.
- **FR-002**: When a stop is skipped and filtered from the segment array, the system MUST NOT use the pre-stored OSRM distance on the preceding stop (which points to the now-skipped neighbor).
- **FR-003**: The system MUST correctly accumulate distances across multiple consecutive skipped stops (e.g., if #14 and #15 are both skipped, the distance from #13 to #16 must be used).
- **FR-004**: When the computed segment ETA is in the past but the scheduled arrival time is still in the future, the system MUST fall back to the schedule-based ETA rather than clamping to 0 minutes.
- **FR-005**: When both the segment ETA and scheduled time are in the past, the system MUST continue to mark the stop as overdue (preserving existing behavior).
- **FR-006**: The fix MUST NOT alter ETA calculations for routes where no stops have been skipped (regression safety).

### Key Entities

- **Segment Distance**: The road distance (from OSRM or haversine fallback) between two consecutive non-skipped stops on a route. Currently pre-stored per stop; must be recalculated dynamically when skips create gaps.
- **Segment ETA**: The estimated arrival time computed by dividing segment distance by average speed, anchored to the last passed stop's timestamp.
- **Schedule ETA**: The fallback ETA derived from the fixed timetable when segment or GPS data is unreliable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any route with skipped stops, the segment-based ETA reflects the actual distance to the next pending stop, not the distance to the skipped stop — verified across all skip patterns (single skip, consecutive skips, non-consecutive skips).
- **SC-002**: The ETA display never shows "0 min" when the van has not yet arrived at the stop and the scheduled time is still in the future.
- **SC-003**: Routes with no skipped stops produce identical ETA results before and after the fix (zero regression).
- **SC-004**: Commuters see a meaningful ETA (either recalculated segment ETA or schedule-based fallback) within 1 refresh cycle after a stop is skipped.

## Assumptions

- The system already has access to OSRM (or haversine fallback) to compute distances between arbitrary stop pairs at runtime, since it does so for GPS-based ETA.
- "Skipped" stops are already reliably marked in the data model (the filtering that removes them from the segment array is correct — only the distance lookup is wrong).
- The schedule-based ETA is a reasonable fallback when segment ETA is unreliable; no new fallback mechanism needs to be invented.
