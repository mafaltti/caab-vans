# Feature Specification: Device-Side Geofencing for Stop Detection

**Feature Branch**: `062-device-side-geofencing`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Analysis document `docs/execution/0106-device-side-geofencing-complete-analysis.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stop Detection During GPS Blackouts (Priority: P1)

As a commuter, I need stop detection to continue working even when the tracker device temporarily loses its GPS reporting capability, so that route progress and ETA remain accurate during common failure modes like Android killing the GPS foreground service, network loss, or rate-limit backoff.

Today, stop detection is 100% server-side: the server checks each GPS ping against stop coordinates. When pings stop arriving (observed multiple times daily across all vans), no stops are detected, and the route progress display stalls until pings resume.

The tracker device should use the mobile OS's built-in place-proximity monitoring (separate from the GPS reporting service) to detect when the van enters a stop's vicinity. These proximity events survive when the GPS service is killed (as long as the app process remains alive), don't depend on network connectivity at trigger time, and are buffered locally until they can be delivered to the server with the next successful ping.

**Why this priority**: This is the core value proposition. Every other story depends on this detection mechanism existing. Without it, nothing else matters.

**Independent Test**: Can be tested by simulating a GPS blackout while driving past a known stop. The system should detect the stop via the proximity event and mark it as passed, even though no GPS pings arrived during the blackout window.

**Acceptance Scenarios**:

1. **Given** a van on an active shift approaching a stop, **When** the GPS reporting service is killed by the OS and the van passes through the stop's proximity zone, **Then** the system detects and records the stop as passed within the next successful ping after service recovery.
2. **Given** a van on an active shift with no network connectivity, **When** the van enters a stop's proximity zone, **Then** the proximity event is buffered locally and delivered to the server once connectivity is restored.
3. **Given** a van on an active shift experiencing a rate-limit backoff cascade, **When** the van enters a stop's proximity zone, **Then** the proximity event is captured independently of the rate-limited GPS pings and delivered when the backoff clears.
4. **Given** a van moving at typical urban speed (50 km/h), **When** it passes through a stop's proximity zone with a 150m radius, **Then** the proximity event is reliably captured (van spends ~22 seconds in the zone at that speed).

---

### User Story 2 - Reliable Event Delivery and Idempotent Processing (Priority: P2)

As a system operator, I need proximity events to be delivered exactly-once even when the tracker device retries due to network failures, duplicate pings, or response loss, so that stop detection is neither missed nor double-counted.

Proximity events piggyback on GPS pings. If a ping carrying events fails or the response is lost, the device retries. The server must process events idempotently (never double-apply) and only confirm events to the device after the stop status has been validated and finalized by the canonical healing process.

**Why this priority**: Without reliable delivery, the core detection (US1) would either lose events silently or corrupt route progress with duplicates. This is the foundation for correctness.

**Independent Test**: Can be tested by sending the same proximity event multiple times (simulating retries) and verifying that the stop is marked passed exactly once, and the device clears its buffer only after server confirmation.

**Acceptance Scenarios**:

1. **Given** a proximity event delivered for the first time, **When** the server processes it and the matched stop survives canonical healing, **Then** the server confirms the event and the device clears it from its local buffer.
2. **Given** a proximity event delivered for the first time, **When** the server processes it but the matched stop is reverted by canonical healing (non-contiguous), **Then** the server does NOT confirm the event and the device retries it on the next ping.
3. **Given** a proximity event re-delivered (retry after response loss), **When** the server already has the event recorded, **Then** the prior outcome is preserved — no double-application, no data corruption.
4. **Given** a previously healed event re-delivered by the device, **When** server-side inference or backfill has since reconnected the chain, **Then** the server re-attempts matching and the stop can stick as passed.
5. **Given** a GPS ping that is a duplicate (same device timestamp as an existing ping), **When** that ping carries proximity events, **Then** the events are still processed and confirmed — they are not silently dropped with the duplicate ping.

---

### User Story 3 - Automatic Configuration Sync (Priority: P3)

As an admin, when I update a stop's coordinates or add/remove stops from a route, I need the tracker devices to automatically pick up the new geofence configuration without manual intervention, so that proximity detection stays aligned with the current route definition.

The tracker fetches its geofence configuration (list of physical places to monitor) from the server on startup and periodically checks for updates via a version stamp in every ping response.

**Why this priority**: Configuration changes are rare (monthly at most), but when they happen, stale regions would cause missed detections or false positives. The resync mechanism ensures self-healing without operator intervention.

**Independent Test**: Can be tested by changing a stop's coordinates on the server and verifying that the tracker detects the version mismatch and re-fetches its geofence regions within one ping cycle.

**Acceptance Scenarios**:

1. **Given** a tracker device starting tracking for the first time, **When** it initializes, **Then** it fetches the geofence configuration for its van's route and begins monitoring the returned regions.
2. **Given** a tracker device already monitoring regions, **When** the server's configuration version changes (admin updated stops), **Then** the tracker detects the mismatch in the next ping response, re-fetches the configuration, and re-registers its monitored regions.
3. **Given** a tracker device rebooting or recovering from app termination, **When** it restarts with tracking enabled, **Then** it immediately re-registers geofences from its local cache (no network wait) and checks for config freshness on the first successful ping.
4. **Given** a tracker device that stops tracking, **When** tracking is disabled, **Then** all geofence monitoring is stopped and cached configuration is cleared.

---

### User Story 4 - GPS-Based Detection as Fallback (Priority: P4)

As a system operator, I need the existing GPS-based server-side stop detection to continue working as a fallback when device-side proximity events are unavailable, so that the system degrades gracefully rather than failing completely.

Device-side geofencing does not survive full app termination (until boot recovery restarts the app), does not work on devices that cannot run the tracker, and may miss events for other reasons. The existing server-side GPS inference must remain operational as a safety net.

**Why this priority**: This ensures the system is strictly additive — device events improve detection but never replace the fallback. Rollback is inherently safe because the old system was never removed.

**Independent Test**: Can be tested by running a van without the geofence feature enabled (or with an older tracker build) and verifying that GPS-based stop detection still works exactly as before.

**Acceptance Scenarios**:

1. **Given** a ping without any proximity events, **When** the server processes it, **Then** the existing GPS-based stop inference runs exactly as it does today.
2. **Given** a stop marked as passed by a proximity event, **When** the GPS-based fallback also detects the same stop, **Then** the higher-confidence source is preserved (no overwrite with lower confidence).
3. **Given** a tracker app version that does not support geofencing (older build), **When** it sends pings to the server, **Then** the server processes them identically to today with no errors or regressions.

---

### Edge Cases

- **Full app termination**: If the OS fully kills the tracker app process (not just the GPS service), proximity monitoring stops until boot recovery restarts the app. Events during this dead window are lost and must rely on GPS-based fallback after restart.
- **Repeated visits to the same physical location**: Some stops are visited multiple times per shift (e.g., Mundo Plaza at 13:50 and 14:30 — 40-minute gap). The system must disambiguate repeated proximity events and match each to the correct scheduled occurrence. Delivery lag from the OS (2-6 minutes on Android) can blur the closest-in-time match.
- **Duplicate OS-level enter events**: Android's GeofencingClient can fire duplicate enter events for the same region. The device must deduplicate events by place identifier + time window (e.g., ignore if same place entered within 60 seconds).
- **Non-contiguous stop detection**: A proximity event for stop D arrives but stops B and C are still pending. The system must handle this via its existing canonical prefix enforcement (revert non-contiguous passed stops) combined with conservative backfill (only the immediate predecessor) and device-side retry for reverted events.
- **Overlapping geofence regions**: The 150m device-side radius must not cause overlapping monitoring zones between adjacent stops. Minimum inter-stop distance (371m for the closest pair) leaves a 71m gap — no overlap with 150m radius.
- **Device reboot**: Geofence registrations are lost on reboot. The boot recovery mechanism must re-register geofences from the local cache immediately upon restart.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tracker device MUST use OS-level place-proximity monitoring to detect when the van enters the vicinity of configured stops, independently of the GPS reporting service.
- **FR-002**: Proximity events MUST be buffered locally on the device and delivered to the server piggybacked on the next successful GPS ping, requiring no additional network calls.
- **FR-003**: The server MUST process proximity events independently of GPS ping deduplication — events attached to a duplicate ping MUST still be processed and acknowledged.
- **FR-004**: The server MUST resolve proximity events against the schedule to determine which specific stop occurrence was visited, using closest-in-time matching within the early arrival window (30 minutes before scheduled time).
- **FR-005**: Proximity event processing MUST be idempotent — re-delivered events MUST NOT corrupt or overwrite prior outcomes. The server MUST maintain a durable event ledger keyed by device-generated event identifier.
- **FR-006**: The server MUST only confirm (acknowledge) a proximity event to the device after the matched stop has survived canonical prefix enforcement (healing). Unconfirmed events remain buffered on the device and are retried.
- **FR-007**: Previously healed events that are re-delivered MUST be re-processed (not silently skipped), allowing them to succeed once server-side inference or backfill has reconnected the chain.
- **FR-008**: Confidence scoring for proximity events MUST be tiered: base confidence of 0.90 (place evidence with imprecise timing), with a +0.05 bonus if a recent GPS ping corroborates the position, capped at 0.95.
- **FR-009**: Proximity-event-triggered backfill MUST be conservative — only the immediate predecessor stop (gap of 1), at reduced confidence (0.80). Server-side GPS backfill retains its existing behavior (gap up to 3).
- **FR-010**: The tracker device MUST fetch its geofence configuration from the server on tracking start and cache it locally for immediate re-registration on boot recovery.
- **FR-011**: The server MUST include a configuration version in every ping response. The tracker MUST detect version mismatches and re-fetch the geofence configuration automatically.
- **FR-012**: The server MUST provide a configuration endpoint that returns the list of unique physical places for a van's route, each with a place identifier, coordinates, and monitoring radius.
- **FR-013**: The device-side monitoring radius MUST be separate from the server-side geofence radius. Default device-side radius is 150m; default server-side radius remains 50m.
- **FR-014**: The device MUST deduplicate OS-level enter events by place identifier + time window (60 seconds) to guard against known Android duplicate event behavior.
- **FR-015**: The existing GPS-based server-side stop detection MUST continue to function unchanged as a fallback when no proximity events are available.
- **FR-016**: Server-side GPS inference MUST NOT overwrite a stop already marked as passed with equal or higher confidence from a proximity event.
- **FR-017**: Proximity events MUST respect the existing shift gate — events received when no active shift exists are recorded but not matched to stops.
- **FR-018**: The proximity monitoring feature MUST NOT require any new device permissions beyond those already granted.
- **FR-019**: Proximity event data MUST include only a place identifier and entry timestamp — no GPS coordinates from the trigger (the OS callback does not provide them).
- **FR-020**: The system MUST support per-van rollback by returning an empty region list from the configuration endpoint, disabling proximity monitoring for that van without a tracker update.

### Key Entities

- **Geofence Region**: A physical place the van passes through. Identified by a place identifier (derived from stop group or coordinates). Has a center point (latitude, longitude) and monitoring radius (default 150m). Multiple schedule entries can share the same region (e.g., Mundo Plaza visited at 13:50 and 14:30).
- **Geofence Event**: A device-detected proximity entry. Contains a place identifier, entry timestamp (callback delivery time), and a client-generated unique event identifier for idempotency. Has no GPS coordinates. Lifecycle: received → matched/no_match.
- **Geofence Event Ledger**: A durable server-side record of all received device events. Keyed by (van, event identifier) for idempotent processing. Tracks which schedule entry was matched and the match status.
- **Tracker Configuration**: The set of geofence regions for a van's route, plus a version stamp derived from the latest schedule modification time. Cached locally on the device for fast boot recovery.

## Assumptions

- The tracker app process remains alive when the GPS foreground service is killed (the most common failure mode observed in production). Full app termination is not covered until boot recovery restarts the app.
- No new native dependencies are introduced — the feature uses capabilities already available in the existing Expo SDK.
- Stop coordinate changes by admins are rare (monthly or less). The resync protocol handles staleness but is not optimized for rapid iteration.
- The existing canonical prefix enforcement and healing mechanisms work correctly and do not need modification.
- The existing shift gate (driver starts/ends shift via driver app) remains unchanged and continues to control when stop detection is active.

## Scope Boundaries

**In scope**:
- Device-side proximity monitoring for enter events at configured stops
- Local event buffering and piggybacking on GPS pings
- Server-side event processing, idempotent ledger, confidence scoring
- Configuration endpoint and automatic resync protocol
- Conservative gap-1 backfill for proximity events
- Post-healing event acknowledgment
- Per-van rollback via empty region list

**Out of scope**:
- Exit events (only enter events are used for stop detection)
- Custom native modules to access Android's triggering location API
- Surviving full app termination without boot recovery
- Changes to the driver app, shift lifecycle, or public-facing pages
- Changes to ETA calculation, map display, or OSRM road snapping
- Batch endpoint (`tracking-batch`) support for proximity events (single-ping endpoint only)

## Dependencies

- Analysis document: `docs/execution/0106-device-side-geofencing-complete-analysis.md` (4 rounds of external review completed, no remaining architectural blockers)
- Existing `expo-location` `startGeofencingAsync()` and `expo-task-manager` geofence task support (verified available in SDK 55)
- Existing boot recovery BroadcastReceiver for cold restart after full termination or reboot
- Existing canonical prefix enforcement in both `enforce-canonical-prefix.ts` and `resolve-route-progress.ts`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Stops missed during a 5-minute GPS blackout (foreground service killed, app alive) decrease from ~100% to less than 5%.
- **SC-002**: Stops missed due to sparse pings at urban speed (50 km/h) decrease from 30-50% to less than 5%.
- **SC-003**: Stops missed during rate-limit backoff cascades decrease from 20-40% to less than 5%.
- **SC-004**: Average confidence score for detected stops increases from 0.70-0.85 to 0.90-0.95.
- **SC-005**: False positive rate for stop detection remains unchanged or decreases (device + server agreement).
- **SC-006**: Existing GPS-based stop detection continues to function identically for tracker versions without geofencing support (zero regression).
- **SC-007**: Tracker configuration updates (admin changes stops) are detected and applied by the device within one ping cycle after the change.
- **SC-008**: No proximity event is lost due to duplicate ping handling — events on duplicate pings are processed and acknowledged correctly.
