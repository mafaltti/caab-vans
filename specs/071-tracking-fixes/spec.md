# Feature Specification: Tracking Reliability Fixes

**Feature Branch**: `071-tracking-fixes`
**Created**: 2026-03-13
**Status**: Draft
**Input**: Fix tracking retry loop, batch geofence queries, and reprocess no_match events (Issues 2, 3, 4B from RCA doc 0115)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stop Deferred Event Retry Loop (Priority: P1)

A van enters a geofence zone matching a stop that is not yet eligible for advancement (an earlier stop in the sequence is still pending). Today, the system leaves this event in an unacknowledged state, causing the tracker device to resend it every few seconds — generating thousands of redundant warnings per shift and draining device battery.

After this fix, the system acknowledges the event so the device removes it from its send buffer. The event is still eligible for re-evaluation when conditions change (e.g., the earlier stop passes), but the device no longer wastes bandwidth resending it.

**Why this priority**: This is the highest-impact issue — it generates ~16,000 warning entries per 4-hour shift across 4 vans, wastes mobile data and battery, and is the root cause of the API header overflow (User Story 2). Fixing this also eliminates stale "received" events from accumulating in the database (Issue 5 from RCA).

**Independent Test**: Can be tested by starting a shift, skipping over a stop, and verifying that a geofence event for a later stop is acknowledged to the device and does not reappear in subsequent pings. Monitoring logs should show near-zero "deferred non-adjacent" warnings.

**Acceptance Scenarios**:

1. **Given** a van has stops A → B → C in sequence and stop A is still pending, **When** the device reports a geofence event for stop B, **Then** the system acknowledges the event (device removes it from buffer) and the event is marked as not yet matched.
2. **Given** a deferred event for stop B exists and stop A subsequently passes, **When** the device sends its next location ping including stop B's event, **Then** the system re-evaluates the event against the now-updated stop sequence and matches it if eligible.
3. **Given** the fix is deployed, **When** a full shift runs with out-of-order geofence arrivals, **Then** the "deferred non-adjacent" warning count drops from thousands to fewer than 10 per shift.

---

### User Story 2 - Prevent API Failures from Large Event Payloads (Priority: P1)

When a van accumulates hundreds of geofence events, the tracking API query that looks up confirmed events sends all event IDs in a single request. This can exceed gateway size limits, causing the API to return errors. Affected vans lose real-time tracking updates until the payload shrinks.

After this fix, the system processes event lookups in manageable batches and enforces a maximum payload size, preventing gateway errors regardless of how many events have accumulated.

**Why this priority**: This directly causes API failures (233 errors in 4 hours observed), breaking tracking for all users watching affected vans. It is a P0 reliability issue.

**Independent Test**: Can be tested by simulating a van with 100+ geofence events in a single ping and verifying the API responds successfully without gateway errors.

**Acceptance Scenarios**:

1. **Given** a van has submitted 100+ geofence events, **When** the tracking API processes the response, **Then** all confirmed events are returned without any gateway or size-related errors.
2. **Given** a device attempts to send more than 100 geofence events in a single request, **When** the request is validated, **Then** the system rejects it with a clear validation error rather than allowing an unbounded payload.
3. **Given** a van has 200 accumulated events, **When** the API queries for confirmed events, **Then** all confirmed events are found and returned regardless of the total count.

---

### User Story 3 - Reprocess Rejected Events After Late Shift Creation (Priority: P2)

When a driver starts their shift late (after vans have already been running), all geofence events received before the shift existed were rejected because no active shift was found. Today, those rejected events are never revisited — even after the shift is created, previously passed stops remain untracked.

After this fix, when a shift is created, the system automatically finds all previously rejected geofence events for that van on that service date and re-evaluates them. Stops that were passed before the shift started are correctly tracked retroactively.

**Why this priority**: This is a P1 issue that directly impacts tracking accuracy. However, it is lower priority than the retry loop and API failures because it only affects the late-start window (typically 1-2 hours) and can be partially mitigated by starting shifts on time. It also depends on Issue 3 being fixed first (rejected events need correct status marking).

**Independent Test**: Can be tested by accumulating geofence events for a van, then starting the shift late, and verifying that previously rejected events are reprocessed and stops advance correctly.

**Acceptance Scenarios**:

1. **Given** a van has been running for 30 minutes with no active shift and has accumulated 5 rejected geofence events, **When** the driver starts the shift, **Then** all 5 events are automatically re-evaluated and matching stops are advanced.
2. **Given** rejected events exist from a previous service date, **When** a shift is created for today, **Then** only today's rejected events are reprocessed (not stale events from other dates).
3. **Given** a shift is created and reprocessing runs, **When** a rejected event matches a stop, **Then** the stop advances exactly as if the event had arrived after the shift was active.

---

### Edge Cases

- What happens when a van has zero rejected events at the time of shift creation? The reprocessing step should be a no-op with no errors.
- What happens when the same geofence event is both deferred (out-of-order) and then reprocessed after shift creation? The system should handle duplicates gracefully without double-advancing stops.
- What happens if the device sends exactly 100 events (the maximum)? The request should be accepted and processed normally.
- What happens if a deferred event's earlier stop never passes during the entire shift? The event remains in its rejected state — no infinite retries occur.
- What happens if shift creation fails partway through reprocessing? The shift should still be created successfully; reprocessing failures should not block the shift start.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST acknowledge out-of-sequence geofence events to the device so they are removed from the device's send buffer, even when the event cannot be matched immediately.
- **FR-002**: System MUST allow previously rejected out-of-sequence events to be re-evaluated when conditions change (e.g., earlier stops pass), without requiring the device to resend them.
- **FR-003**: System MUST enforce a maximum number of geofence events per tracking request (100 events).
- **FR-004**: System MUST process event lookups in batches when querying confirmed events, to prevent exceeding gateway size limits.
- **FR-005**: System MUST automatically re-evaluate rejected geofence events for a van when a shift is created for that van's service date.
- **FR-006**: Reprocessing of rejected events MUST be scoped to the current service date only — events from other dates MUST NOT be affected.
- **FR-007**: Reprocessing MUST use the same matching logic as real-time event processing, ensuring consistent stop advancement behavior.
- **FR-008**: Shift creation MUST succeed even if event reprocessing encounters errors — reprocessing failures MUST NOT block the shift start response.

### Key Entities

- **Geofence Event**: A record of a van entering a geofence zone around a stop. Has a status lifecycle: received → matched/no_match. Key attributes: event ID, van, place, entry timestamp, status.
- **Shift (Route Run)**: A daily instance of a route being actively operated. Key attributes: van, service date, start time, end time. Events can only be matched to stops while a shift is active.
- **Stop (Route Run Stop)**: An individual scheduled stop within an active shift. Has a sequence order and a status (pending → passed). Geofence events advance stops from pending to passed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: "Deferred non-adjacent" warning volume drops by 99% or more (from ~16,000 per 4-hour shift to fewer than 10).
- **SC-002**: Zero gateway/size-related errors when processing tracking responses, even with 100+ accumulated events per van.
- **SC-003**: When a shift is started late, 100% of previously rejected same-day geofence events are automatically re-evaluated within the shift creation flow.
- **SC-004**: Device battery and mobile data consumption decrease measurably due to elimination of redundant event retransmissions (estimated 90%+ reduction in geofence-related traffic).

## Assumptions

- The existing duplicate-detection and reprocessing logic correctly resets rejected events to "received" status when the device resends them. This mechanism is relied upon for re-evaluation of deferred events.
- The 100-event cap per request is sufficient for normal operations. Based on observed data, vans typically accumulate 20-50 events per shift under normal conditions; 300+ events only occurred due to the retry loop bug.
- Gateway size limits (Kong default 4KB header / 8KB buffer) are the constraint driving the batch query approach. These limits are not being changed as part of this fix.
- The tracker app's behavior of removing events from its send buffer when acknowledged by the server is already implemented and working correctly.
