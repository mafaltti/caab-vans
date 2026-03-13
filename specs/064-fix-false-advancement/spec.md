# Feature Specification: Prevent False Stop Advancement From Out-of-Order Device Geofences

**Feature Branch**: `064-fix-false-advancement`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Hotfix plan `docs/execution/0109-prevent-false-advancement-out-of-order.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Block Out-of-Order Stop Advancement (Priority: P1)

A van is travelling a route where two stops (e.g., Forum Ruy Barbosa then CAAB) are geographically close. The road passes through the CAAB geofence before the van actually reaches Forum. Today, the system incorrectly marks Forum as passed (via gap-1 backfill) and advances to the next stop. After this fix, the system must only advance route progress when the matched stop extends the contiguous passed sequence from the beginning of the route.

**Why this priority**: This is the core bug. False advancement causes commuters to see incorrect "next stop" and ETA information, eroding trust in the live tracking feature.

**Independent Test**: Can be fully tested by simulating an out-of-order geofence event and verifying no stop status changes occur.

**Acceptance Scenarios**:

1. **Given** a route run with stops A (seq 17, pending) and B (seq 18, pending), **When** the device reports entering B's geofence before A, **Then** stop B is NOT marked passed, the geofence event stays in "received" status, and `next_stop_id` remains on A.
2. **Given** a route run with stops A (seq 17, pending) and B (seq 18, pending), **When** the device reports entering A's geofence (the first pending stop), **Then** stop A IS marked passed with source "device_geofence", the event is marked "matched", and `next_stop_id` advances to B.
3. **Given** the same scenario as (1), **When** stop A is later confirmed passed (by any source) and then B's buffered event is re-processed, **Then** B is now contiguous and IS marked passed.

---

### User Story 2 - Deferred Event Retry (Priority: P1)

When a geofence event is deferred (because it matched a non-first-pending stop), the tracker device keeps that event in its local buffer because it was not acknowledged. On subsequent pings, the device re-submits the event. The system must re-evaluate the event and mark the stop passed once it becomes the head of the pending list.

**Why this priority**: Without retry, deferred events would be lost and stops would never be confirmed even when the van legitimately passes them.

**Independent Test**: Can be tested by simulating a deferred event followed by a later ping where the earlier stop has been resolved.

**Acceptance Scenarios**:

1. **Given** a deferred event for stop B (seq 18) while stop A (seq 17) is pending, **When** stop A is marked passed and the device re-submits B's event, **Then** B is now head-of-line and is marked passed.
2. **Given** a deferred event for stop B, **When** the device re-submits B's event but stop A is still pending, **Then** B remains deferred and the event is still not acknowledged.

---

### User Story 3 - Defense-in-Depth Acknowledgement (Priority: P2)

Even if a stop is somehow marked passed out of order (e.g., race condition, legacy data), the system must not acknowledge that event to the device unless the stop is part of the contiguous passed prefix from the beginning of the route.

**Why this priority**: Safety net. Prevents stale or corrupted data from causing the device to clear a buffered event that should still be retried.

**Independent Test**: Can be tested by querying acknowledgement results against a route with non-contiguous passed stops.

**Acceptance Scenarios**:

1. **Given** a route with stops A (pending), B (passed — corrupted), C (pending), **When** the device submits a ping, **Then** `processedEventIds` does NOT include B's event because B is not in the contiguous prefix.
2. **Given** a route with stops A (passed), B (passed) contiguously, **When** the device submits a ping, **Then** `processedEventIds` includes events for both A and B.

---

### User Story 4 - Per-Stop Geofence Radius Tuning (Priority: P2)

For dense downtown segments where stops are close together and road geometry causes premature geofence entry, operators can set a smaller geofence radius per stop to reduce the likelihood of out-of-order triggers in the first place.

**Why this priority**: Reduces the frequency of deferred events, complementing the core fix.

**Independent Test**: Can be tested by verifying that specific stops use custom radius values instead of the default.

**Acceptance Scenarios**:

1. **Given** a stop with an explicit geofence radius of 80m, **When** the tracker device requests its configuration, **Then** the config includes the 80m radius for that stop instead of the 150m default.

---

### Edge Cases

- What happens when a van skips a stop entirely (geofence never fires for stop A)? The deferred event for stop B retries indefinitely until the route run ends. Deferred events have no TTL in this version; a follow-up should add run-end cleanup.
- What happens when the same geofence event is submitted multiple times? Existing deduplication logic handles this — duplicate events with `received` status are re-evaluated, duplicates with `matched` status are idempotent.
- What happens when stop_sequence data is incorrect? The contiguity check uses stop_sequence ordering. Incorrect sequences could block legitimate events. This is mitigated by stop_sequence being auto-computed on schedule entry insert.
- What happens during a race between stop processing and canonical prefix healing? The route.ts defense-in-depth check handles this — if healing reverts a stop to pending, its event is not acknowledged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST only mark a geofence-matched stop as "passed" when it is the first pending stop in stop_sequence order (i.e., it extends the contiguous passed prefix).
- **FR-002**: System MUST NOT perform gap-1 backfill (automatically marking the preceding stop as passed when a later stop is matched).
- **FR-003**: System MUST leave a non-adjacent matched event in "received" status so it can be retried on subsequent pings.
- **FR-004**: System MUST log deferred non-adjacent events with identifying context (van, run, event, matched stop, first pending stop, sequences) for operational monitoring.
- **FR-005**: System MUST compute `processedEventIds` based on the contiguous passed prefix of the route run, not merely on individual stop status.
- **FR-006**: System MUST preserve existing behavior for in-order events: matching, marking passed, confidence scoring, GPS corroboration, and acknowledgement.
- **FR-007**: System MUST preserve existing duplicate-ping and event deduplication behavior.
- **FR-008**: Operators MUST be able to set per-stop geofence radii for dense stop clusters via the existing `device_geofence_radius_m` column.

### Key Entities

- **Geofence Event** (`tracking_geofence_events`): A device-reported geofence entry. Statuses: `received` (new or deferred), `matched` (successfully confirmed a stop), `no_match` (no eligible stop found). Linked to a van and optionally to a route run and schedule entry.
- **Route Run Stop** (`route_run_stops`): A per-run instance of a scheduled stop. Statuses: `pending` or `passed`. Includes pass metadata (timestamp, source, confidence). Keyed by run + schedule entry.
- **Schedule Entry** (`schedule_entries`): A stop in a route's schedule with sequence, times, coordinates, and optional `device_geofence_radius_m` override.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Out-of-order geofence events (e.g., CAAB firing before Forum) produce zero false stop advancements — the earlier stop must never be auto-backfilled or skipped.
- **SC-002**: In-order geofence events continue to mark stops as passed and return their event IDs in acknowledgements with no regression in behavior.
- **SC-003**: Deferred events are successfully retried and confirmed once they become head-of-line, with no event data loss.
- **SC-004**: Commuters see accurate "next stop" information at all times — no incorrect advancement visible on the live tracking page.
- **SC-005**: Operational logs clearly identify deferred events on known problematic route segments (e.g., CAAB/Forum cluster) within the first day of deployment.

## Scope

### In Scope

- Contiguous-prefix guard in geofence event processing.
- Removal of gap-1 backfill logic.
- Defense-in-depth canonical prefix check in event acknowledgement.
- Per-stop geofence radius configuration (database values, not code changes).
- Structured logging for deferred events.
- One-time manual data remediation for existing non-contiguous passed stops.

### Out of Scope

- Schema changes to the geofence events or route run stops tables.
- Mobile tracker app changes (no contract change).
- A dedicated "deferred" event status (follow-up if needed for observability).
- TTL or automatic expiration for deferred events (follow-up: run-end cleanup).
- First-class out-of-order evidence model (future design if needed).

## Assumptions

- Stop sequence ordering in `schedule_entries` is correct and maintained by the auto-compute trigger (migration 00016).
- The tracker device correctly re-submits unacknowledged events on subsequent pings (existing behavior).
- The `enforceCanonicalPrefix` helper correctly identifies contiguous passed prefixes (existing, tested).
- Target geofence radii for dense downtown stops (CAAB, Forum Ruy Barbosa, etc.) will be determined by auditing GPS traces and road geometry before deployment.
- The one-time SQL remediation will be executed manually immediately after deployment by an operator.

## Dependencies

- Existing `enforceCanonicalPrefix` helper in `enforce-canonical-prefix.ts`.
- Existing `stop_sequence` column and auto-compute trigger on `schedule_entries`.
- Existing `device_geofence_radius_m` column on `schedule_entries` (migration 00015).
- Tracker device buffering behavior (unacked events stay in local buffer and are re-submitted).
