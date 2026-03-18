# Feature Specification: GPS Corroboration Gate for Device Geofence Stop Advancement

**Feature Branch**: `077-geofence-corroboration`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "Add GPS corroboration gate for device geofence stop advancement"

## Clarifications

### Session 2026-03-18

- Q: What specific duration defines GPS staleness for the fallback trigger? → A: 30 seconds since geofence event receipt with no new GPS reading.
- Q: How long should a pending corroboration survive if never resolved? → A: Expire when the current shift ends — pending corroborations are discarded with the route run.
- Q: Should GPS accuracy metadata factor into the 50m corroboration check? → A: No — use raw distance against the 50m threshold. The radius already has sufficient margin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - GPS-Corroborated Stop Confirmation (Priority: P1)

As a commuter, when a van passes near a stop (entering the device geofence zone at 100-150m), I need the system to wait for GPS evidence showing the van is actually at the stop (within 50m) before marking it as passed, so that route progress and ETA information remain accurate and I am not misled by false positives caused by nearby roads.

Today, when the device geofence fires, the stop is immediately marked as passed even if the van is still 120m away on a parallel road. This causes commuters to see incorrect "next stop" and ETA values, especially on route segments where the road passes through a stop's wide geofence zone without the van actually stopping.

**Why this priority**: This is the core behavior change. Without it, false stop advancements continue to degrade commuter trust. Every other story depends on this corroboration gate existing.

**Independent Test**: Can be tested by simulating a device geofence event while GPS shows the van at 100m from the stop. The stop should NOT be immediately marked as passed. It should only be confirmed once a subsequent GPS reading shows the van within 50m.

**Acceptance Scenarios**:

1. **Given** a van on an active route approaches a stop and the device geofence fires at ~120m distance, **When** the next GPS reading still shows the van is 80m from the stop, **Then** the stop remains in "pending" status and route progress does not advance.
2. **Given** a device geofence event is waiting for corroboration, **When** a subsequent GPS reading shows the van within 50m of the stop, **Then** the stop is confirmed as passed with high confidence, the geofence event is acknowledged, and route progress advances.
3. **Given** a device geofence event is waiting for corroboration, **When** the van drives through the geofence zone without coming within 50m (e.g., on a parallel road), **Then** the stop is NOT marked as passed, and the geofence event remains unacknowledged for potential retry.
4. **Given** multiple GPS readings arrive while corroboration is pending, **When** each reading shows the van progressively closer (e.g., 100m, 70m, 30m), **Then** the stop is confirmed only when the distance crosses the 50m threshold.

---

### User Story 2 - GPS Staleness Fallback (Priority: P1)

As a commuter, when a van's GPS stream becomes unreliable or stops arriving entirely (common during Android battery optimization, network loss, or service kills), I need the system to fall back to trusting the device geofence event on its own, so that route progress does not stall indefinitely waiting for GPS data that may never come.

The device-side geofence was specifically designed to provide stop detection when GPS is unreliable. If the system requires GPS corroboration but GPS data stops arriving, the corroboration gate must not become a blocking deadlock. Instead, the natural staleness of the GPS stream serves as the fallback trigger: if no new GPS readings are arriving, the system trusts the device geofence and marks the stop as passed.

**Why this priority**: Equal to P1 because without this fallback, the corroboration gate would make stop detection strictly worse than today during GPS blackouts -- the exact scenario device geofencing was built to handle.

**Independent Test**: Can be tested by triggering a device geofence event and then stopping GPS delivery. After the GPS stream goes stale (no new readings arriving), the stop should be confirmed from the device geofence alone.

**Acceptance Scenarios**:

1. **Given** a device geofence event is waiting for corroboration, **When** no new GPS readings arrive (stream goes stale), **Then** the system trusts the device geofence and marks the stop as passed at a confidence level reflecting the lack of GPS evidence.
2. **Given** a device geofence event is waiting for corroboration, **When** GPS readings are still arriving but show the van is far from the stop (>50m), **Then** the system does NOT fall back -- it continues waiting because the active GPS stream contradicts the geofence.
3. **Given** GPS readings have been arriving regularly (every ~5 seconds), **When** 30 seconds pass after a geofence event with no new GPS reading received, **Then** the system recognizes the stream as stale and applies the fallback.

---

### User Story 3 - Request-Driven Corroboration Evaluation (Priority: P2)

As a system operator, I need the corroboration check to run within existing request-driven flows (triggered by each incoming GPS reading from the tracker device) rather than requiring a new background scheduler or timer, so that the system architecture remains simple and no new infrastructure is needed.

**Why this priority**: This constrains the solution design to avoid unnecessary complexity. The system is already request-driven (GPS readings arrive every ~5 seconds), providing a natural evaluation cadence. A background scheduler would add operational burden for minimal benefit.

**Independent Test**: Can be tested by verifying that corroboration evaluation occurs on each GPS reading arrival and that no background timer or scheduler is required to drive the corroboration decision.

**Acceptance Scenarios**:

1. **Given** a device geofence event is waiting for corroboration, **When** the next GPS reading arrives from the tracker, **Then** the system evaluates corroboration as part of processing that reading.
2. **Given** a device geofence event is waiting for corroboration, **When** no GPS readings arrive, **Then** no corroboration evaluation runs (the system does not poll or use timers). The staleness fallback (User Story 2) triggers on the next request that does arrive.
3. **Given** multiple pending geofence events exist, **When** a GPS reading arrives, **Then** all pending events are evaluated in a single pass.

---

### User Story 4 - Commuter-Facing Delay Transparency (Priority: P3)

As a commuter watching live route progress, I expect the typical delay between a van arriving at a stop and the stop being shown as "passed" to remain acceptable (under 60 seconds), so that route progress still feels real-time.

The corroboration gate introduces a brief processing delay: the van triggers the device geofence at ~150m from the stop and must travel another ~100m to reach the 50m corroboration threshold. At typical urban speeds (30-50 km/h), this takes approximately 7-12 seconds. Including GPS delivery latency, the total delay is typically 15-30 seconds, well within the acceptable range.

**Why this priority**: Informational -- this story documents the expected latency impact rather than requiring specific work. The delay is an inherent consequence of the corroboration gate and must be acceptable.

**Independent Test**: Can be tested by measuring the time between the device geofence trigger and the stop being confirmed as passed under normal GPS conditions, and verifying it remains under 60 seconds.

**Acceptance Scenarios**:

1. **Given** a van approaching a stop with GPS readings arriving normally (~5 second intervals), **When** the device geofence fires and the van continues toward the stop, **Then** the stop is confirmed as passed within 60 seconds of the geofence event.
2. **Given** a commuter watching the live tracking page, **When** a stop is awaiting corroboration, **Then** the commuter sees no difference in the interface -- the stop remains "pending" until confirmed, just as it would if no geofence had fired yet.

---

### Edge Cases

- **Van stops just outside the corroboration threshold**: A van enters the device geofence zone (150m) but parks at 55m from the stop (e.g., traffic, detour). GPS readings consistently show ~55m. The stop should NOT be confirmed because the van never crosses the 50m threshold. If the van then departs the geofence zone entirely, the event remains unconfirmed.
- **Rapid geofence enter/exit at zone boundary**: The device geofence fires as the van clips the edge of the 150m zone (e.g., on a tangential road) but GPS shows the van moving away. The system should NOT confirm the stop because GPS shows increasing distance.
- **Multiple stops with pending geofence events**: Two geofence events arrive in quick succession (e.g., adjacent stops on a downtown segment). Each event should be evaluated independently against the contiguous-prefix rule and the corroboration threshold. Only the first-pending stop can be confirmed.
- **GPS reading arrives before the geofence event**: GPS shows the van within 50m of a stop, but no device geofence event has arrived yet. GPS-only readings do NOT advance stops -- the system relies exclusively on device geofence events (with corroboration) for stop advancement. The GPS reading is simply recorded; if a device geofence event arrives later, the recent GPS evidence will be used for corroboration.
- **Device geofence event for a stop that was already passed**: The stop was previously confirmed (e.g., by GPS-based detection or an earlier corroborated event). The duplicate geofence event should be handled idempotently -- no re-processing, no state change.
- **Geofence event during a route run with no active GPS stream**: If the tracker is sending geofence events but has never sent any GPS readings in the current session (e.g., GPS is completely unavailable), the system should apply the staleness fallback immediately since there is no GPS stream to wait for.
- **Clock/timestamp discrepancies**: The device geofence event timestamp and GPS reading timestamps come from different clocks. The staleness evaluation should be based on server-side receipt times, not device-reported timestamps, to avoid clock-skew issues.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST NOT immediately mark a stop as passed when a device geofence event is received. Instead, the event MUST enter a "waiting for corroboration" state.
- **FR-002**: The system MUST confirm a pending geofence event (mark the stop as passed) when a GPS reading shows the van within the server-side corroboration radius (50m) of the stop.
- **FR-003**: The system MUST continue holding a pending geofence event when GPS readings are arriving but show the van farther than the corroboration radius from the stop.
- **FR-004**: The system MUST fall back to trusting the device geofence alone (without GPS corroboration) when the GPS stream goes stale -- that is, when no new GPS readings have been received by the server within 30 seconds of the geofence event's receipt.
- **FR-005**: The system MUST evaluate all pending geofence events on each incoming GPS reading, as part of the existing request-driven processing flow. No background timers or schedulers are required.
- **FR-006**: Corroboration MUST respect the existing contiguous-prefix rule: a stop can only be confirmed if it is the first pending stop in sequence order (extending the contiguous passed prefix from the start of the route).
- **FR-007**: A pending geofence event that is NOT corroborated (GPS shows the van consistently outside the corroboration radius until it leaves the device geofence zone) MUST remain unacknowledged so the tracker device retains it for potential future retry.
- **FR-008**: Confirmed stops MUST receive a higher confidence score when GPS-corroborated than when confirmed via the staleness fallback, reflecting the difference in evidence quality.
- **FR-009**: The corroboration gate MUST be transparent to the commuter-facing interface -- pending corroboration is not a visible state. Stops appear as "pending" until confirmed and then as "passed."
- **FR-010**: The existing deferred-event mechanism (for out-of-order geofence events) MUST continue to work alongside corroboration. A deferred event that later becomes head-of-line still requires corroboration before confirmation.
- **FR-011**: The corroboration radius MUST use the existing server-side geofence radius configuration (50m default, per-stop override), NOT the larger device-side geofence radius.
- **FR-012**: GPS staleness evaluation MUST use server-side receipt timestamps, not device-reported timestamps, to avoid clock-skew issues between the tracker device and the server.
- **FR-013**: The system MUST handle the case where no GPS stream has ever been established in the current session (GPS completely unavailable) by applying the staleness fallback immediately for any geofence events received.
- **FR-014**: Pending corroborations that are never resolved (neither GPS-corroborated nor staleness-fallback) MUST expire when the current shift ends. They are discarded with the route run and do not carry over.

### Key Entities

- **Pending Corroboration**: A device geofence event that has been received but not yet confirmed by GPS evidence. Holds the geofence event identity, the matched stop, and the server-side timestamp of receipt. Transitions to "confirmed" (GPS corroborated or staleness fallback) or expires when the current shift ends — pending corroborations are discarded with the route run.
- **Corroboration Radius**: The distance threshold (default 50m, configurable per stop) within which a GPS reading confirms a pending geofence event. Uses the existing server-side geofence radius, distinct from the larger device-side geofence radius (100-150m) that triggers the initial event.
- **GPS Stream Staleness**: A determination that the GPS reporting stream has become unreliable, defined as no new GPS reading received by the server within 30 seconds of the geofence event's receipt. When stale, the corroboration gate falls back to trusting device geofence evidence alone.
- **Geofence Event**: An existing entity representing a device-detected proximity entry. Gains a new lifecycle phase: "waiting for corroboration" between receipt and confirmation/acknowledgement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: False stop advancements caused by the device geofence firing on nearby roads (van >50m from stop) decrease to zero -- stops are only confirmed when GPS corroborates proximity or when GPS is unavailable.
- **SC-002**: Stop detection during GPS blackouts (no GPS readings arriving) remains functional via the staleness fallback, with no regression compared to the current immediate-confirmation behavior.
- **SC-003**: The typical delay between a van physically arriving at a stop and the stop being confirmed as passed remains under 60 seconds when GPS is operational.
- **SC-004**: No new background processes, timers, or schedulers are introduced -- corroboration runs entirely within the existing request-driven flow.
- **SC-005**: The contiguous-prefix rule is maintained -- out-of-order stops are never confirmed regardless of GPS corroboration.
- **SC-006**: Existing GPS-only stop detection (for tracker versions without device geofencing) continues to function identically with zero regression.
- **SC-007**: Confidence scores for confirmed stops accurately reflect the evidence quality: higher for GPS-corroborated confirmations, lower for staleness-fallback confirmations.

## Assumptions

- GPS readings from the tracker arrive approximately every 5 seconds when the foreground service is active, and at longer intervals when in background mode.
- The existing deferred-event machinery (for out-of-order stops not yet at the head of the pending list) is compatible with corroboration and can be extended to support the "waiting for corroboration" phase.
- The server-side corroboration radius (50m default) is sufficient to distinguish "van is at the stop" from "van is on a nearby road." This is based on the existing geofence radius that was chosen for server-side GPS inference. GPS accuracy metadata is not factored into the distance check — the 50m radius provides sufficient margin for typical GPS variance.
- The tracker device will continue to re-submit unacknowledged geofence events on subsequent pings, providing the natural retry mechanism for events that are not yet corroborated.
- Android's device geofence callbacks are already buffered and delivered reliably; this feature does not change the device-side geofence behavior, only the server-side processing of the resulting events.
