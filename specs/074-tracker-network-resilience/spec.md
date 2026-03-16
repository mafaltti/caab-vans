# Feature Specification: Tracker Network Resilience

**Feature Branch**: `074-tracker-network-resilience`
**Created**: 2026-03-16
**Status**: Draft
**Input**: Tracker network resilience improvements — fixes for self-reinforcing failure loop when cellular connectivity is spotty, causing vans to appear stuck on the map despite active GPS collection.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Recovery After Connectivity Loss (Priority: P1)

A van drives through an area with poor cellular coverage. The tracker app fails to deliver GPS pings and enters a backoff state. When cellular connectivity returns, the app automatically detects the network change, resets its retry state, and delivers all buffered location data without driver intervention.

**Why this priority**: This is the root cause of the observed production incident (Van 04 stuck on map all day). Without automatic recovery on reconnect, every connectivity blip can cascade into hours of lost tracking data.

**Independent Test**: Can be fully tested by toggling airplane mode on a device with active tracking. After disabling airplane mode, buffered data should flush within seconds.

**Acceptance Scenarios**:

1. **Given** the tracker has accumulated failures and is in a backoff state, **When** cellular connectivity transitions from offline to online, **Then** the retry state resets immediately and the app attempts to deliver buffered data within 10 seconds.
2. **Given** the tracker is connected and operating normally, **When** connectivity briefly drops and returns, **Then** the app resumes normal delivery without entering a prolonged backoff.
3. **Given** the tracker detects a network recovery, **When** the app is paused due to authentication failure, **Then** the app does NOT attempt to flush (respects the auth gate).

---

### User Story 2 - Reduced Silent Periods During Server Errors (Priority: P1)

When the tracker receives a server error (rate-limit or server failure) on a real-time ping, it still attempts to deliver previously buffered data. Additionally, the maximum wait time between retry attempts is capped so that the app never goes silent for more than one minute.

**Why this priority**: The original failure loop was sustained because failed pings prevented buffer flush AND the backoff grew to 5 minutes. Fixing both ensures the app stays active even during transient server issues.

**Independent Test**: Can be tested by simulating server errors on the ingestion endpoint and observing that (a) the buffer still drains, and (b) retry intervals never exceed 60 seconds.

**Acceptance Scenarios**:

1. **Given** a real-time ping fails with a server error (5xx) or rate-limit (429), **When** there are points in the buffer, **Then** the app attempts to flush the buffer despite the real-time failure.
2. **Given** a real-time ping fails due to no network connectivity, **When** there are points in the buffer, **Then** the app does NOT attempt a buffer flush (no network means the batch will also fail).
3. **Given** the tracker has experienced many consecutive failures, **When** the retry backoff is calculated, **Then** the maximum wait time between retries never exceeds 60 seconds.

---

### User Story 3 - Background Health Check Restarts Tracking (Priority: P2)

If the operating system silently kills the location tracking process (common on aggressive battery-management Android devices), a periodic background health check detects that tracking has stopped and automatically restarts it — without requiring the driver to open the app.

**Why this priority**: Covers the edge case where the OS kills tracking entirely. The 15-minute minimum check interval means it cannot catch every gap instantly, but it prevents multi-hour silent failures.

**Independent Test**: Can be tested by force-stopping the location service on a device and verifying that tracking resumes within 15 minutes without user interaction.

**Acceptance Scenarios**:

1. **Given** tracking is enabled but the location service has been killed by the OS, **When** the periodic health check runs, **Then** tracking is automatically restarted and a recovery event is logged.
2. **Given** tracking is enabled and the location service is running but hasn't fired a callback in over 10 minutes, **When** the health check runs, **Then** the location service is restarted.
3. **Given** tracking has been intentionally disabled by the driver, **When** the health check runs, **Then** no restart is attempted.

---

### User Story 4 - Driver Notification on Prolonged Failure (Priority: P2)

When the tracker has been unable to deliver location data for an extended period (10+ consecutive failures), the driver receives a local notification alerting them to check their connection — giving them the opportunity to take action (e.g., toggle airplane mode, move to better coverage).

**Why this priority**: Provides a human fallback when automatic recovery is insufficient. The driver is the only actor who can toggle airplane mode or physically move to better coverage.

**Independent Test**: Can be tested by blocking network access for the tracker and verifying a notification appears after the failure threshold is reached.

**Acceptance Scenarios**:

1. **Given** the tracker has failed to deliver data 10 or more consecutive times, **When** the failure count reaches the threshold, **Then** the driver receives a high-priority local notification prompting them to check their connection.
2. **Given** a failure notification has already been sent during this failure episode, **When** additional failures occur, **Then** no duplicate notifications are sent.
3. **Given** a failure notification was sent, **When** delivery succeeds again, **Then** the notification state resets so it can fire again in a future failure episode.

---

### User Story 5 - Larger Buffer Prevents Data Loss During Extended Outages (Priority: P3)

The tracker can store significantly more GPS points locally during extended connectivity outages, preventing data loss from buffer overflow. When connectivity returns, the buffer is flushed in manageable chunks to respect server rate limits.

**Why this priority**: Provides a safety net for extended outages. With the core resilience fixes in place, prolonged buffer saturation should be rare, making this a hardening measure.

**Independent Test**: Can be tested by keeping a device offline for 40+ minutes with active tracking, then restoring connectivity and verifying all buffered points are delivered.

**Acceptance Scenarios**:

1. **Given** the tracker is offline and collecting GPS data, **When** the buffer reaches its previous capacity (100 points), **Then** data collection continues without dropping older points (up to the new capacity of ~40 minutes of data at standard collection intervals).
2. **Given** the buffer contains more data than can be sent in a single request, **When** a flush is triggered, **Then** data is sent in sequential chunks that respect the server's per-request limits.
3. **Given** a chunked flush is in progress and one chunk fails, **When** the failure occurs mid-flush, **Then** already-sent chunks are removed from the buffer and remaining data is preserved for the next attempt.

---

### User Story 6 - GPS Restart on Network Recovery (Priority: P3)

When the network recovers and the tracker detects that the GPS location service has been silently killed (by aggressive Android battery management), it immediately restarts the location service rather than waiting for the next periodic health check.

**Why this priority**: Defensive measure that fills the gap between network reconnection and the next 15-minute health check. Only relevant on devices where OEM battery management kills the location service.

**Independent Test**: Can be tested on an aggressive battery-management device by causing a network outage, waiting for the OS to kill the location service, then restoring connectivity and verifying the location service restarts immediately.

**Acceptance Scenarios**:

1. **Given** the network has just recovered (offline→online) and the location service is no longer running, **When** the network listener fires, **Then** the location service is restarted and a recovery event is logged.
2. **Given** the network has just recovered and the location service IS running, **When** the network listener fires, **Then** no restart is attempted.

---

### Edge Cases

- What happens if the network listener fires during an active data send? The system must prevent concurrent flush attempts.
- What happens if the app process is restarted while in a backoff state? The backoff state must be restored from persistent storage, and the network listener must be re-established.
- What happens if the driver revoked location permissions while offline? The GPS restart attempt should fail gracefully without crashing.
- What happens if multiple network state changes fire in rapid succession (flapping connectivity)? Only the transition from offline→online should trigger recovery actions; online→online transitions should be ignored.
- What happens if the health check and network listener both try to restart tracking simultaneously? Only one restart should proceed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tracker MUST subscribe to network state changes and detect offline→online transitions in real time (not only via polling during GPS callbacks).
- **FR-002**: On network recovery, the tracker MUST reset its retry backoff state and attempt an immediate buffer flush, provided there is no authentication failure in progress.
- **FR-003**: The tracker MUST attempt to flush buffered data after receiving server errors (5xx, 429) on real-time pings, but NOT after network errors.
- **FR-004**: The maximum retry backoff interval MUST NOT exceed 60 seconds, regardless of consecutive failure count.
- **FR-005**: The tracker MUST register a periodic background health check that detects and restarts killed location services.
- **FR-006**: The health check MUST run at the platform-minimum interval (~15 minutes) and persist across device reboots.
- **FR-007**: The tracker MUST send a local notification to the driver after 10 or more consecutive delivery failures, sent only once per failure episode.
- **FR-008**: The local buffer capacity MUST hold at least 40 minutes of GPS data at the standard collection interval (5 seconds).
- **FR-009**: Buffer flush MUST support chunked delivery to respect per-request server limits, with partial failure handling that preserves unsent data.
- **FR-010**: On network recovery, the tracker MUST check if the location service is still running and restart it if killed, logging the recovery event.
- **FR-011**: The network listener MUST be torn down when tracking is stopped to prevent resource leaks.
- **FR-012**: All recovery and failure events MUST be logged to the diagnostic log for production monitoring.

### Key Entities

- **Location Buffer**: Local queue of GPS points collected when the device cannot deliver them in real time. Has a maximum capacity and supports chunked flush.
- **Backoff State**: Tracks consecutive failure count and the earliest time the next retry is allowed. Persisted across app restarts. Reset on successful delivery or network recovery.
- **Health Check Task**: Periodic background job that monitors whether the location tracking service is alive and restarts it if necessary.
- **Failure Notification**: One-shot local notification sent to the driver when delivery failures exceed a threshold. Resets when delivery succeeds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No van shows sustained buffer saturation (buffer at maximum capacity for more than 10 consecutive pings) under normal operating conditions after deployment.
- **SC-002**: After a connectivity outage of 2 minutes or less, buffered location data is fully delivered within 30 seconds of network recovery.
- **SC-003**: The maximum gap between delivery retry attempts is 60 seconds, regardless of how many consecutive failures have occurred.
- **SC-004**: If the location service is killed by the OS, tracking is automatically restarted within 15 minutes without driver intervention.
- **SC-005**: Drivers are notified via local notification within 2 minutes of sustained delivery failure, giving them the opportunity to take corrective action.
- **SC-006**: During a 40-minute connectivity outage, zero GPS data points are lost due to buffer overflow.

## Assumptions

- The tracker device has notification capabilities already available and notification permissions are granted.
- The mobile platform enforces a minimum interval of ~15 minutes for periodic background tasks, and this interval is acceptable for health check frequency.
- The batch ingestion endpoint has a separate rate-limit bucket from the single-ping endpoint, allowing buffer flush even when real-time pings are rate-limited.
- Concurrent flush prevention (existing guard mechanism) is sufficient to prevent race conditions between the network listener, health check, and regular GPS callbacks.
- The existing foreground service configuration remains the primary mechanism for keeping the location service alive; the health check is a secondary safety net.
