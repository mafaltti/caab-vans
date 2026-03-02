# Feature Specification: Fix Tracking Freshness Check

**Feature Branch**: `020-fix-tracking-freshness`
**Created**: 2026-03-02
**Status**: Draft
**Input**: Replace the calendar-day freshness check for van operation status with a recency-based check (e.g., last ping within N minutes)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger sees van as active when GPS pings are recent (Priority: P1)

A passenger opens the CAAB Vans app to check if their van is running. The system determines operation status based on whether the van has sent a GPS ping within the last few minutes, rather than whether the ping was on the same calendar day. This correctly reflects real-time van activity regardless of time-of-day edge cases (e.g., midnight crossover).

**Why this priority**: This is the core bug fix. The current calendar-day check causes vans to appear "Fora de operacao" immediately after midnight even when they are actively sending GPS pings, breaking the primary user experience.

**Independent Test**: Can be fully tested by sending a GPS ping and verifying the route list API returns `isRunning: true` and `isLocationOutdated: false`.

**Acceptance Scenarios**:

1. **Given** a van sent a GPS ping 3 minutes ago and the current time is within the route's schedule window, **When** a passenger views the routes list, **Then** the route shows as "Em operacao".
2. **Given** a van sent a GPS ping 3 minutes ago and the current time is 00:05 (just after midnight, within schedule window), **When** a passenger views the routes list, **Then** the route shows as "Em operacao" (not falsely marked outdated due to calendar-day boundary).
3. **Given** a van has not sent a GPS ping in over 10 minutes but the current time is within the schedule window, **When** a passenger views the routes list, **Then** the route shows as "Fora de operacao".
4. **Given** a van has never sent a GPS ping (`location_updated_at` is null), **When** a passenger views the routes list, **Then** the route shows as "Fora de operacao".

---

### User Story 2 - Passenger sees accurate staleness indicator on route detail (Priority: P2)

When a passenger opens a specific route detail page, the location staleness indicator ("Desatualizado" warning) reflects whether the last ping is recent, not whether it happened on the same calendar day.

**Why this priority**: Builds on the same freshness logic from P1 but applied to the detail view. Ensures consistent behavior across list and detail views.

**Independent Test**: Can be tested by viewing a route detail page after sending a ping and verifying the outdated warning appears or disappears correctly.

**Acceptance Scenarios**:

1. **Given** a van sent a GPS ping 2 minutes ago, **When** a passenger views the route detail, **Then** the location is NOT marked as outdated.
2. **Given** a van's last GPS ping was 15 minutes ago, **When** a passenger views the route detail, **Then** the location IS marked as outdated with a warning indicator.

---

### Edge Cases

- What happens when the freshness threshold is exactly met (e.g., last ping was exactly 10 minutes ago)? The system treats it as stale (threshold is exclusive).
- What happens during server clock drift? The system uses the same server clock for both "now" and the stored timestamp, minimizing drift impact.
- What happens if `location_updated_at` is in the future (clock sync issue)? The system treats it as fresh (the van is clearly active).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST determine van location freshness by comparing the time elapsed since the last GPS ping against a staleness threshold, instead of checking whether the ping occurred on the same calendar day.
- **FR-002**: The default staleness threshold MUST be 10 minutes. A ping older than 10 minutes is considered stale.
- **FR-003**: A route MUST be considered "running" (`isRunning: true`) only when BOTH conditions are met: (a) the current time is within the route's schedule window, AND (b) the last GPS ping is within the freshness threshold.
- **FR-004**: The API response field `isLocationOutdated` MUST reflect the recency-based check (true when last ping exceeds the staleness threshold or is null).
- **FR-005**: The freshness check MUST work correctly across midnight boundaries (e.g., a ping at 23:58 should still be fresh at 00:03 if within threshold).

### Assumptions

- The 10-minute default threshold is appropriate for the current GPS ping frequency (pings are expected every ~30 seconds from the tracker app). This provides generous buffer for connectivity gaps.
- The staleness threshold does not need to be user-configurable in the UI for MVP; a code-level constant is sufficient.
- Both the routes list API and route detail API must use the same freshness logic for consistency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Vans actively sending GPS pings show as "Em operacao" 100% of the time when within schedule window, regardless of time of day (including midnight crossover).
- **SC-002**: Vans that stop sending GPS pings are marked "Fora de operacao" within 10 minutes of the last ping.
- **SC-003**: The `isLocationOutdated` flag accurately reflects ping recency with zero false positives from calendar-day boundary issues.
