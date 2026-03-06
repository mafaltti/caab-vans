# Feature Specification: Tracker Resilience, Reliability & Observability

**Feature Branch**: `040-tracker-resilience`
**Created**: 2026-03-05
**Status**: Draft
**Input**: Tracker architecture resilience improvements based on analysis doc 0058

---

## Overview

The van tracker app sends GPS location data from drivers to the server in near real-time. Under adverse conditions -- server errors, poor connectivity, battery drain, or background task termination -- location data can be silently lost with no indication to the driver or operations team. This specification defines improvements to make the tracker resilient to failures, efficient with resources, and observable by operations.

---

## Assumptions

- Buffer size increases assume mobile device storage is not a constraint for small GPS payloads (a few KB each).
- Batch ingestion assumes the server can handle multi-point submissions in a single request.
- A battery threshold of 20% is used as the low-battery level, following industry standards.
- A 24-hour time-to-live for buffered points matches existing server-side validation rules.
- Sequence numbering and gap detection are informational only; no automatic recovery or interpolation is expected.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No More Silent Data Loss (Priority: P0)

As a van driver, I need all GPS points to be preserved and eventually delivered even when the server is temporarily unavailable, so that passengers always see an accurate route history and live position.

Currently, points are lost when the server returns a non-network error, the buffer fills up too quickly, or stalled requests block new submissions. These fixes eliminate the most common causes of silent data loss.

**Why this priority**: Data loss is the single most damaging failure mode. Every lost point degrades passenger experience and operator trust.

**Independent Test**: Simulate server errors and connectivity loss for varying durations, then verify zero points are permanently lost within the buffer capacity window.

**Acceptance Scenarios**:

1. **Given** the server returns a 5xx error for a GPS point, **When** the tracker processes the failed submission, **Then** the point is added to the offline buffer for retry (not discarded).
2. **Given** the tracker has buffered points and regains connectivity, **When** it sends data to the server, **Then** the current real-time point is sent first, followed by buffered historical points.
3. **Given** the tracker is operating normally, **When** the buffer capacity is checked, **Then** it can hold at least 100 points (sufficient for approximately 8 minutes of continuous movement or 1.5 hours of stationary pings).
4. **Given** a server request is in progress, **When** the request has been pending for more than 10 seconds, **Then** the request is aborted so it does not block subsequent location submissions.
5. **Given** buffered points exist, **When** the buffer is flushed, **Then** all buffered points are sent in a single batch request rather than individual sequential requests.

### User Story 2 - Graceful Degradation Under Persistent Failures (Priority: P1)

As a van driver, I need the tracker to behave intelligently during extended outages -- backing off retries, discarding stale data, and alerting me when my session has expired -- so that the app does not waste battery or bandwidth on futile operations.

**Why this priority**: Without backoff and TTL management, the tracker hammers a failing server, drains battery, and sends data the server will reject anyway.

**Independent Test**: Simulate extended outages (30+ minutes) and expired authentication, then verify the app backs off retries, prunes expired points, and notifies the driver of auth failures.

**Acceptance Scenarios**:

1. **Given** consecutive submission failures, **When** the tracker schedules the next retry, **Then** the delay between retries increases exponentially (e.g., 5s, 10s, 20s, up to a maximum cap) and resets to normal on success.
2. **Given** buffered points older than 24 hours exist, **When** the buffer is prepared for flush, **Then** expired points are discarded before sending, avoiding unnecessary bandwidth usage and guaranteed server rejection.
3. **Given** the server returns consecutive 401 (unauthorized) responses, **When** the failure threshold is reached, **Then** the tracker pauses sending and displays a clear alert to the driver to re-authenticate.

### User Story 3 - Driver Awareness of Tracking Failures (Priority: P1)

As a van driver, I need to know when tracking has silently stopped working so that I can take corrective action (restart the app, check connectivity) instead of driving an entire route with no data being sent.

**Why this priority**: The worst failure mode is the driver believing tracking is active when it is not. This erodes trust and leaves passengers without live updates.

**Independent Test**: Force-kill the background task on Android, then verify the app detects the failure and alerts the driver within a reasonable time window.

**Acceptance Scenarios**:

1. **Given** the background tracking task has been killed by the operating system, **When** the app is next brought to the foreground or a health check runs, **Then** the app detects that no location data has been submitted recently (based on a timestamp threshold) and displays a warning to the driver.
2. **Given** the driver sees a "tracking may have stopped" warning, **When** they acknowledge it, **Then** the app provides a clear action to restart tracking.

### User Story 4 - Operations Observability (Priority: P2)

As an operations team member, I need visibility into the health and status of each active tracker so that I can proactively identify and resolve issues before passengers are affected.

**Why this priority**: Currently there is no way to know a tracker is silently failing until a passenger complains about missing live updates. Proactive monitoring prevents escalations.

**Independent Test**: Run a tracker with degraded connectivity, then verify the operations dashboard reflects the tracker health status accurately.

**Acceptance Scenarios**:

1. **Given** a tracker is actively running, **When** a health reporting interval elapses, **Then** the tracker sends a health report including: buffer size, consecutive failure count, battery level, and network connection type.
2. **Given** a tracker has not sent a health report within the expected interval, **When** an operator views the monitoring interface, **Then** the tracker is flagged as potentially offline.
3. **Given** a tracker reports a high buffer size or high failure count, **When** an operator views the monitoring interface, **Then** the tracker is highlighted as degraded.

### User Story 5 - Resource Efficiency and Data Integrity (Priority: P2)

As a van driver, I need the tracker to be efficient with battery and bandwidth, and as an operator, I need confidence that location data is complete and ordered correctly.

**Why this priority**: Battery drain is a top complaint for background tracking apps. Sequence numbering enables operators to detect and quantify data gaps.

**Independent Test**: Run the tracker below 20% battery and verify GPS accuracy is reduced. Verify sequence numbers are present and gaps are detectable server-side.

**Acceptance Scenarios**:

1. **Given** the device battery drops below 20%, **When** the tracker adjusts its GPS settings, **Then** it switches to a lower-accuracy location mode to conserve battery, and resumes high accuracy when the battery is charged above the threshold.
2. **Given** the tracker is sending GPS points, **When** each point is created, **Then** it includes a monotonically increasing sequence number unique to the current tracking session.
3. **Given** the server receives points with sequence numbers, **When** a gap in the sequence is detected, **Then** the gap is logged for operational awareness (no automatic recovery is attempted).

### User Story 6 - Foundational Reliability Improvements (Priority: P3)

As a development team, we need crash reporting, secure credential storage, and protection against data corruption so that we can diagnose production issues and maintain data integrity.

**Why this priority**: These are important engineering hygiene items that reduce risk over time but are not immediately user-facing.

**Independent Test**: Trigger a crash and verify it appears in the error reporting service. Verify credentials are not stored in plaintext. Verify concurrent buffer operations do not corrupt data.

**Acceptance Scenarios**:

1. **Given** the tracker app encounters an unhandled error, **When** the error occurs, **Then** it is captured and reported to a centralized error reporting service with sufficient context to diagnose the issue.
2. **Given** the driver authentication token is stored on the device, **When** the storage mechanism is inspected, **Then** the token is stored in a secure, encrypted storage facility rather than plaintext.
3. **Given** multiple concurrent operations attempt to read and write the offline buffer simultaneously, **When** the operations execute, **Then** a synchronization mechanism prevents data corruption from overlapping read-modify-write cycles.

### Edge Cases

- Buffer reaches the 100-point hard maximum: the oldest points are evicted to make room for newer ones (ring buffer behavior).
- Driver loses connectivity immediately after starting a route: the tracker should buffer from the very first point with no data loss.
- Server alternates between healthy and failing responses: the backoff counter should reset on each success to avoid penalizing intermittent recovery.
- Battery fluctuates around the 20% threshold: hysteresis should prevent rapid toggling between GPS accuracy modes (e.g., resume high accuracy at 25%).
- Driver auth token expires mid-route: the tracker should buffer points (not discard them) while alerting the driver, so points can be sent after re-authentication.
- App is force-closed and reopened: the offline buffer must persist across app restarts.

---

## Requirements *(mandatory)*

### Functional Requirements

**Data Preservation**

- **FR-001**: Server error responses (5xx) must trigger offline buffering of the failed point, identical to network error handling.
- **FR-002**: When flushing buffered data after reconnection, the current real-time point must be transmitted before historical buffered points.
- **FR-003**: The offline buffer must hold a maximum of 100 location points (up from current 50). When full, the oldest points are evicted to make room for newer ones (ring buffer behavior).
- **FR-004**: Individual submission requests must be aborted after a maximum of 10 seconds.
- **FR-005**: Buffered points must be sent to the server in a single batch request rather than sequential individual requests. The batch endpoint is a hard requirement with no sequential fallback; server and tracker updates must be deployed together.

**Failure Management**

- **FR-006**: Consecutive submission failures must trigger exponential backoff in retry intervals (5s, 10s, 30s, 60s, up to 5 minutes maximum). During backoff, all sending is paused and the current point is buffered. The first attempt after a backoff period serves as the probe; on success, backoff resets to normal.
- **FR-007**: Buffered points older than 24 hours must be discarded before transmission.
- **FR-008**: Consecutive authentication failures (401 responses) must cause the tracker to pause submissions and notify the driver.

**Driver Feedback**

- **FR-009**: The app must detect when the background tracking task has been terminated by the operating system and alert the driver.
- **FR-010**: Alerts must include a clear action for the driver to restart tracking.

**Observability**

- **FR-011**: The tracker must include health metadata (buffer size, failure count, battery level, network type) as additional fields on each location ping, eliminating the need for a separate reporting channel.
- **FR-012**: The operations interface must flag trackers that have missed expected health reports.
- **FR-013**: The operations interface must highlight trackers reporting degraded status (high buffer, high failures).

**Resource Efficiency**

- **FR-014**: When battery level drops below 20%, the tracker must switch to a lower GPS accuracy mode to conserve power.
- **FR-015**: GPS accuracy must resume to high when battery level recovers above the hysteresis threshold (25%).

**Data Integrity**

- **FR-016**: Each GPS point must include a monotonically increasing sequence number scoped to the route run (resets when a new route is started).
- **FR-017**: The server must log detected gaps in sequence numbers for operational review.

**Engineering Reliability**

- **FR-018**: Unhandled application errors must be captured and reported to a centralized error reporting service.
- **FR-019**: Authentication tokens must be stored in secure, encrypted device storage.
- **FR-020**: Concurrent read-modify-write operations on the offline buffer must be synchronized to prevent data corruption.

### Non-Functional Requirements

- **NFR-001**: Batch flush must complete in a single round trip, respecting existing server rate limits.
- **NFR-002**: Health reports must not noticeably impact battery life or data usage.
- **NFR-003**: Buffer persistence must survive app restarts and device reboots.
- **NFR-004**: The driver alert for terminated tracking must appear within 60 seconds of the app returning to the foreground.

### Key Entities

- **Location Point**: A single GPS reading with coordinates, timestamp, speed, and session sequence number.
- **Offline Buffer**: A persistent, ordered collection of unsent location points with TTL enforcement and a hard maximum of 100 points (ring buffer; oldest evicted when full).
- **Health Report**: Health metadata piggybacked on each location ping, summarizing tracker operational state (buffer size, failure count, battery level, network type).
- **Tracking Session**: Scoped to a route run (starts at "Start Route", ends at "End Route"), providing the context for sequence numbering and gap detection.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero location points are permanently lost due to server 5xx errors (previously 100% loss rate for non-network errors).
- **SC-002**: Buffer capacity supports approximately 8 minutes of continuous tracking without connectivity (100 points at 12 pings/min, up from 50).
- **SC-003**: Batch flush reduces the number of HTTP requests during buffer recovery by at least 95% compared to sequential sending.
- **SC-004**: Stalled requests are terminated within 10 seconds (down from 15 seconds).
- **SC-005**: After 10+ consecutive failures, retry interval reaches at least 60 seconds (previously 0 seconds between retries).
- **SC-006**: Expired points (older than 24 hours) are never sent to the server, eliminating guaranteed-rejection requests.
- **SC-007**: Drivers are alerted within 60 seconds when background tracking has been terminated by the OS.
- **SC-008**: Operations team can identify a silently failing tracker within one health report interval (no more relying on passenger complaints).
- **SC-009**: Battery consumption during low-battery tracking is measurably reduced compared to always-high-accuracy mode.
- **SC-010**: Sequence number gaps are detectable server-side, enabling data completeness auditing per tracking session.
- **SC-011**: Authentication token is not recoverable from plaintext device storage inspection.

---

## Implementation Phases

| Phase | Stories | Priority | Description |
|-------|---------|----------|-------------|
| Phase 1 - Stop the Bleeding | Story 1 | P0 | Eliminate silent data loss with minimal changes |
| Phase 2 - Graceful Failure Handling | Stories 2, 3 | P1 | Backoff, TTL, auth handling, task kill detection |
| Phase 3 - Observability and Efficiency | Stories 4, 5 | P2 | Health reporting, battery adaptation, sequence numbers |
| Phase 4 - Engineering Hygiene | Story 6 | P3 | Error reporting, secure storage, concurrency safety |

Each phase is independently deployable and delivers incremental value. Phase 1 should be completed first as it addresses the highest-impact issues with the smallest changes.

---

## Clarifications

### Session 2026-03-05

- Q: Should exponential backoff delay all sending or only buffer flush retries? → A: Backoff delays all sending (current point + flush). During backoff delay, the current point is buffered (not lost). Saves battery/bandwidth on low-end phones with shared 3G (per doc 0057 rationale).
- Q: What defines tracking session boundaries for sequence numbering? → A: Session = route run (starts at "Start Route", ends at "End Route"), mapping to the existing route_run lifecycle.
- Q: How should health reports be delivered? → A: Piggyback health fields on existing location pings (no separate endpoint). During outages, health data is buffered alongside location points.
- Q: Should the buffer have a hard maximum with eviction? → A: Hard maximum of 100 points (up from current 50 minimum); oldest points evicted when full.
- Q: Should the batch flush endpoint have a sequential fallback during rollout? → A: No fallback. Batch endpoint is a hard requirement; server and tracker must be deployed together.

---

## Resolved Questions

- **Backoff cap**: Maximum delay cap for exponential backoff is **5 minutes**. Balances recovery speed with resource conservation for typical 30-60 minute routes.
- **Health report interval**: Health reports are sent every **60 seconds**. Balances observability with battery/bandwidth impact.
