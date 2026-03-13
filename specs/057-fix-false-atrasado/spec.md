# Feature Specification: Fix False "Atrasado" (Overdue) Status

**Feature Branch**: `057-fix-false-atrasado`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "Fix false Atrasado status displayed to passengers when the van is early or on-time at stops"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger sees correct status when van is early (Priority: P1)

A passenger checking the app while the van is ahead of schedule and waiting at a stop should see the estimated arrival time for the next stop — not an "Atrasado" (overdue) warning. Today, the system incorrectly shows "Atrasado" because the ETA computation in the segment fallback path does not consider whether the scheduled stop time has actually passed.

**Why this priority**: This is the core bug. It misleads passengers into thinking the service is delayed when it is actually running early or on time. Happens frequently in real operations.

**Independent Test**: Can be tested by simulating a van that passed a stop earlier than scheduled and verifying the next stop status is "estimated" (not "overdue") while the scheduled time is still in the future.

**Acceptance Scenarios**:

1. **Given** a van passed stop A at 17:10 (scheduled 17:15) and the next stop B is scheduled at 17:40, **When** the system computes ETA at 17:17 via the segment fallback, **Then** the status is "estimated" (not "overdue"), because 17:40 has not passed yet.
2. **Given** a van passed stop A at 17:15 (scheduled 17:15) and the next stop B is scheduled at 17:25, **When** the system computes ETA at 17:20 via the segment fallback and the computed ETA is 17:18, **Then** the status is "estimated" (not "overdue"), because 17:25 has not passed yet.
3. **Given** a van passed stop A at 17:20 (scheduled 17:15) and the next stop B is scheduled at 17:25, **When** the system computes ETA at 17:30 and the computed ETA is 17:28, **Then** the status is "overdue", because both the computed ETA and the scheduled time (17:25) have passed.

---

### User Story 2 - Schedule fallback also guards against false overdue (Priority: P2)

When the system falls back to schedule-based ETA computation (no GPS, no segment data), the same false overdue pattern could theoretically occur if negative delay pushes the ETA into the past while the scheduled time is still in the future. The schedule fallback should apply the same guard for consistency and robustness.

**Why this priority**: Lower likelihood of false positive in this path (schedule-based ETA is anchored to scheduled time), but applying the same guard ensures consistent behavior across all fallback paths.

**Independent Test**: Can be tested by simulating a schedule fallback scenario with a negative delay and verifying the status remains "estimated" while the scheduled stop time is in the future.

**Acceptance Scenarios**:

1. **Given** the schedule fallback computes an ETA that is in the past due to negative delay, **When** the scheduled time for the next stop is still in the future, **Then** the status is "estimated" (not "overdue").
2. **Given** the schedule fallback computes an ETA that is in the past, **When** the scheduled time for the next stop has also passed, **Then** the status is "overdue".

---

### Edge Cases

- What happens when the van passes a stop exactly at the scheduled time and the computed segment ETA equals the current time? The system should not show "overdue" if the next stop's scheduled time is still in the future.
- What happens when the van is very early (e.g., 20+ minutes ahead of schedule)? The segment ETA may be far in the past, but the next stop should still show "estimated" until its scheduled time passes.
- What happens when the GPS path is active (van is moving)? No change — the GPS path already returns "estimated" and is unaffected by this bug.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The segment fallback ETA path MUST NOT mark a stop as "overdue" unless both the computed ETA and the stop's scheduled time have passed.
- **FR-002**: The schedule fallback ETA path MUST NOT mark a stop as "overdue" unless both the computed ETA and the stop's scheduled time have passed.
- **FR-003**: The GPS-based ETA path MUST remain unchanged (it already returns "estimated" correctly).
- **FR-004**: Existing tests MUST continue to pass; new regression tests MUST cover the early-van and on-time-van scenarios for both segment and schedule fallback paths.

### Key Entities

- **ETA Status**: A computed status for the next stop — one of "estimated", "overdue", or "none".
- **Scheduled Stop Time**: The pre-defined time (HH:mm) for each stop in the route schedule, used as a guard against false overdue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No false "Atrasado" is displayed when a van is ahead of schedule and waiting at a stop.
- **SC-002**: Legitimate "Atrasado" status continues to be displayed when a van is genuinely late (both computed ETA and scheduled time have passed).
- **SC-003**: All existing ETA tests pass without modification; new tests cover the false-positive scenarios for both segment and schedule fallback paths.

## Assumptions

- The `parseTime()` utility (which parses HH:mm strings into today's DateTime in the canonical timezone) is already available and correct.
- The `nextStop.time` field (HH:mm format) is always populated for pending stops.
- No frontend changes are needed — fixing the ETA computation at the source eliminates the false "overdue" status for all consuming components.
