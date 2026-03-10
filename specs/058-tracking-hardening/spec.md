# Feature Specification: Tracking System Hardening

**Feature Branch**: `058-tracking-hardening`
**Created**: 2026-03-09
**Status**: Draft
**Input**: Harden tracking system to fix five confirmed gaps: event-time replay for batch pings, canonical write logic for stop progress, shared position selection for ETA and passage, source-aligned confidence evidence, and orphaned-shift health observability.

## Clarifications

### Session 2026-03-10

- Q: How is service date determined for pings near midnight — calendar date, cutoff-based, or shift-anchored? → A: Calendar date only — service date = calendar date of the ping's device timestamp in America/Bahia. CAAB van routes operate during daytime hours, so calendar date is always correct.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Stop Progress from Buffered GPS Pings (Priority: P1)

A commuter is tracking a van that travels through areas with intermittent connectivity. The tracker device buffers GPS pings and sends them in a batch when connectivity is restored. Each buffered ping that crosses a stop geofence must advance stop progress correctly, even though the pings arrive out of real-time order. The commuter sees the van's progress updated to reflect all stops it actually passed, not just the stop nearest to the latest ping.

**Why this priority**: This is the most impactful gap. Without event-time replay, buffered pings that cross intermediate stops are silently lost, causing stop progress to skip or stall. This directly affects commuter trust and route accuracy.

**Independent Test**: Send a batch of GPS pings where an earlier ping crosses Stop B and a later ping does not cross any stop. Verify that Stop B is marked as passed with the correct device timestamp.

**Acceptance Scenarios**:

1. **Given** a van on an active route with stops A, B, C in order, and Stop A already passed, **When** a batch of buffered pings arrives where an earlier ping (by device time) is within Stop B's geofence and a later ping is between stops B and C, **Then** Stop B is marked as passed with its `passed_at` equal to the earlier ping's device timestamp.
2. **Given** a van sends a batch of 5 pings, **When** 3 of the 5 are duplicates of previously stored pings, **Then** only the 2 new pings trigger stop inference, and progress reflects only the non-duplicate pings.
3. **Given** a batch of buffered pings arrives after the van's shift has ended (by wall-clock time), **When** the pings' device timestamps fall within the shift's active window, **Then** stop inference still processes them correctly using device time rather than wall-clock time.

---

### User Story 2 - Consistent Stop Progress Without Phantom Passed Stops (Priority: P1)

A commuter views a route where the van briefly registers near a non-adjacent stop (e.g., due to GPS drift or a road that passes close to a downstream stop). The system must not show that downstream stop as "passed" if the van has not yet passed the intermediate stops. Only a contiguous sequence of passed stops from the route start is valid.

**Why this priority**: Non-contiguous "passed" stops confuse commuters and produce incorrect ETA calculations. This is a data integrity issue that directly affects the reliability of displayed progress.

**Independent Test**: Simulate a low-confidence geofence match at a non-adjacent stop and verify the system does not persist it as passed. Verify that any previously corrupted non-contiguous passed rows are healed back to pending.

**Acceptance Scenarios**:

1. **Given** a route with stops A, B, C, D in order and only Stop A is passed, **When** a GPS ping triggers a geofence match at Stop C (skipping B), **Then** Stop C is NOT marked as passed, and progress remains at Stop A.
2. **Given** a route where stops A, B, and D are marked as passed in storage (D is non-contiguous because C is pending), **When** the next inference cycle runs, **Then** Stop D is reverted to pending with its `passed_at`, pass source, and confidence cleared, and the canonical progress is A and B only.
3. **Given** a van legitimately passes stops A, B, and C in order, **When** each geofence match meets the confidence threshold, **Then** all three are marked as passed and the contiguous prefix includes all three.

---

### User Story 3 - Consistent Position for ETA and Stop Detection (Priority: P2)

A commuter checks a van's ETA to their stop. The ETA calculation and the stop passage detection must use the same effective position for the active target stop. If the road-snapped position places the van closer to the stop, both ETA and passage should agree. If raw GPS is more reliable near a particular stop, both should use raw GPS.

**Why this priority**: When ETA and passage use different coordinate sources, the commuter may see contradictory information (e.g., ETA says "arriving" but the stop is not marked as passed, or vice versa). Alignment improves trust and reduces confusion.

**Independent Test**: For a van near the active stop, compute the effective position used by both ETA and passage, and verify they are identical.

**Acceptance Scenarios**:

1. **Given** a van near Stop B with both raw and road-snapped coordinates available, **When** the raw position is closer to Stop B than the snapped position, **Then** both ETA and stop passage use the raw position for Stop B.
2. **Given** a van with road-snapped coordinates that are closer to the active stop, **When** stop passage and ETA are computed, **Then** both use the snapped position for that stop.
3. **Given** a van where snapped coordinates are unavailable (e.g., OSRM is down), **When** ETA and passage are computed, **Then** both fall back to raw GPS coordinates.

---

### User Story 4 - Reliable Confidence Scoring for Stop Passage (Priority: P2)

The system uses recent GPS evidence to determine confidence that a van has actually passed a stop. The evidence must be drawn from the same coordinate source that triggered the match (raw or snapped), and must not be artificially limited to a fixed number of pings. A time-based evidence window ensures that both fast-moving and slow-moving vans are evaluated fairly.

**Why this priority**: Capped evidence (e.g., 50 pings) can either miss real crossings or over-count for slow vans. Source-aligned evidence prevents false positives from coordinate mismatches.

**Independent Test**: Verify that a geofence match triggered by snapped coordinates counts confirming pings only from stored snapped coordinates, not raw coordinates.

**Acceptance Scenarios**:

1. **Given** a geofence match triggered by snapped coordinates, **When** confidence is evaluated, **Then** only pings with stored snapped coordinates within the evidence window are counted as confirming.
2. **Given** a van that has sent 80 pings in the last 5 minutes, **When** confidence is evaluated, **Then** all 80 pings in the time window are considered (no arbitrary cap).
3. **Given** a geofence match triggered by raw coordinates, **When** confidence is evaluated, **Then** confirming pings are counted using raw coordinates.

---

### User Story 5 - Orphaned Shift Visibility (Priority: P3)

An operator or commuter viewing a route sees a health indicator when a shift appears orphaned (the scheduled end time has long passed and the van has gone silent). This provides transparency without silently rewriting the route status. A background reconciliation process eventually closes truly orphaned shifts, but the read path surfaces the issue immediately.

**Why this priority**: Orphaned shifts are an operational edge case. The reconciliation script already exists; this story adds observability so that if reconciliation is delayed or stops running, the issue is still visible.

**Independent Test**: Query a route whose shift is 90+ minutes past schedule end and 30+ minutes since last ping, and verify the response includes a health indicator of "orphaned."

**Acceptance Scenarios**:

1. **Given** a route with an open shift that ended its schedule 90+ minutes ago and the van has not pinged in 30+ minutes, **When** route progress is queried, **Then** the response includes a health status of "orphaned."
2. **Given** a route with an active shift that is still within its schedule window, **When** route progress is queried, **Then** the health status is "normal."
3. **Given** the reconciliation job is not running, **When** a shift meets orphan criteria, **Then** the read path still surfaces "orphaned" health status without waiting for the job.

---

### Edge Cases

- What happens when a batch contains pings that span two different service dates (e.g., around midnight)?
  - Each ping's service date is derived from its own device timestamp in the canonical timezone. Pings belonging to different service dates are processed against their respective route runs.
- What happens when all pings in a batch are duplicates?
  - No stop inference is triggered. The van's last-known position is not updated. The batch is a no-op.
- What happens when OSRM is unavailable during batch ingestion?
  - Snapped coordinates are not computed. Stop inference proceeds with raw coordinates only. Confidence scoring uses raw evidence.
- What happens when a van's GPS drifts repeatedly near a non-adjacent stop?
  - The canonical write logic prevents non-contiguous stops from being marked as passed, regardless of how many confirming pings are received for that stop.
- What happens when a shift is started but no pings ever arrive?
  - The shift eventually meets orphan criteria (90 min past schedule end + 30 min inactivity) and is surfaced as "orphaned" on the read path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST process each accepted ping in a batch individually for stop inference, in chronological order by device timestamp.
- **FR-002**: System MUST derive the service date for each ping as the calendar date of the ping's device timestamp in America/Bahia (no post-midnight cutoff extension).
- **FR-003**: System MUST allow stop inference to process pings whose device timestamps fall within a shift's active window, even if the shift has ended by wall-clock time.
- **FR-004**: System MUST record `passed_at` as the device timestamp of the ping that triggered the geofence match, not the server processing time.
- **FR-005**: System MUST persist stop progress only as a contiguous prefix from the route start. Non-contiguous passed stops must not be stored as passed.
- **FR-006**: System MUST revert any previously stored non-contiguous passed stops back to pending, clearing their pass metadata.
- **FR-007**: System MUST derive `last_passed_stop_id` and `next_stop_id` solely from the contiguous canonical prefix.
- **FR-008**: System MUST use the same effective position (raw or snapped) for both ETA calculation and stop passage detection for the active target stop.
- **FR-009**: System MUST select the effective position based on which coordinate source (raw or snapped) is closer to the target stop, with a displacement threshold.
- **FR-010**: System MUST evaluate stop passage confidence using evidence from the same coordinate source that triggered the match.
- **FR-011**: System MUST not impose an arbitrary cap on the number of pings considered for confidence; instead, use a time-based evidence window.
- **FR-012**: System MUST store per-ping snapped coordinates when road-snapping is available, to support source-aligned confidence scoring.
- **FR-013**: System MUST surface a health indicator ("normal" or "orphaned") for route runs on the read path, based on shared orphan detection criteria.
- **FR-014**: System MUST use the same orphan detection criteria (schedule overdue threshold + inactivity threshold) in both the read path and the reconciliation process.
- **FR-015**: System MUST still run stop inference for accepted pings even when the van position update is skipped (e.g., for older pings in a batch).

### Key Entities

- **Van Location Ping**: An individual GPS reading from a tracker device. Key attributes: device timestamp, raw coordinates, snapped coordinates (optional), van identifier.
- **Route Run Stop**: The progress state of a single stop within an active route run. Key attributes: status (pending/passed), passed timestamp, pass source, pass confidence.
- **Route Run**: A daily instance of a route. Key attributes: service date, shift start/end times, last passed stop, next stop, health status.
- **Effective Position**: A computed position chosen from raw or snapped coordinates based on proximity to a target stop. Used for both ETA and passage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of buffered batch pings that cross a stop geofence advance stop progress, regardless of arrival order or timing relative to shift end.
- **SC-002**: Zero non-contiguous passed stops persist in storage after any inference cycle.
- **SC-003**: ETA and stop passage always use the same effective position for the active target stop, producing zero contradictory results.
- **SC-004**: Confidence scoring considers all qualifying pings within the evidence time window, with no arbitrary cap.
- **SC-005**: Orphaned shifts are surfaced on the read path within the same request, without depending on the background reconciliation job having run.
- **SC-006**: All existing tracking functionality continues to work correctly (no regressions in normal real-time ping processing, ETA display, or route progress).

## Assumptions

- Batch size remains capped at 100 pings, making sequential replay acceptable for performance.
- The canonical timezone for service date derivation is America/Bahia.
- The existing orphan detection thresholds (90 minutes past schedule end, 30 minutes inactivity) are correct and do not need adjustment.
- No separate evidence/audit table is introduced in this iteration; `route_run_stops` stores only canonical state.
- Displayed map position for commuters remains road-snapped when available; the effective position alignment applies only to ETA and stop passage calculations.
- OSRM availability is best-effort; raw GPS fallback is always acceptable.
