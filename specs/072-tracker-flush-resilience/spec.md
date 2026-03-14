# Feature Specification: Tracker Flush Resilience

**Feature Branch**: `072-tracker-flush-resilience`
**Created**: 2026-03-13
**Status**: Draft
**Input**: User description: "Fix tracker flush storm, 429 backoff, geofence replay on boot, and cold start cascade — identified via production log analysis on 2026-03-13"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable ping delivery after startup (Priority: P1)

When the tracker app starts (or resumes from background), buffered GPS pings should be sent to the server in a controlled manner — one flush operation at a time — so that the server is not overwhelmed and subsequent pings continue to flow normally throughout the tracking session.

**Why this priority**: The flush storm is the root cause that triggers the entire failure cascade. In the observed session, 3,613 pings were sent in the first minute due to 202 concurrent flush calls, which tripped the server rate limiter and effectively killed ping delivery for the rest of the day. Fixing this unblocks all other issues.

**Independent Test**: Start the tracker app with 8+ buffered pings. Observe that exactly one flush operation runs at a time and all buffered pings are sent in a single controlled batch, not duplicated across concurrent flushes.

**Acceptance Scenarios**:

1. **Given** the tracker app starts with buffered pings, **When** multiple location callbacks arrive simultaneously, **Then** only one flush operation executes at a time — subsequent calls are skipped.
2. **Given** a flush is already in progress, **When** another location callback triggers a flush, **Then** the second flush does not read or send the same buffer contents.
3. **Given** 8 buffered pings exist, **When** the app starts and the first flush completes, **Then** exactly 8 pings are sent to the server (not 8 x N concurrent flushes).

---

### User Story 2 - Graceful handling of rate limiting (Priority: P1)

When the server responds with a 429 (rate limited) status, the tracker app should back off progressively before retrying, preserving buffered pings for later delivery rather than hammering the server immediately on the next cycle.

**Why this priority**: Even after the flush storm is fixed, any burst scenario (boot with large buffer, network recovery) can trigger rate limiting. Without backoff, the app enters a permanent retry-fail loop. In the observed session, 183 rate-limited flushes occurred with a 25.9% success rate because no backoff was applied to 429 responses.

**Independent Test**: Simulate a 429 response from the server. Observe that subsequent flush attempts are delayed by increasing intervals, matching the existing 5xx backoff behavior.

**Acceptance Scenarios**:

1. **Given** a ping or flush receives a 429 response, **When** the next flush cycle triggers, **Then** the app waits at least the first backoff delay (several seconds) before retrying.
2. **Given** consecutive 429 responses occur, **When** each retry also returns 429, **Then** the backoff delay increases progressively up to a maximum.
3. **Given** the app is in backoff after a 429, **When** a successful send eventually completes, **Then** the backoff state resets and normal sending resumes.
4. **Given** the app is in backoff, **When** new location points arrive, **Then** they are buffered (not dropped) for later delivery.

---

### User Story 3 - Suppressed geofence replay on cold start (Priority: P2)

When the tracker app cold-starts (process recycled, device reboot, or app update), geofence enter events that the OS replays from its internal queue should be suppressed or deduplicated so that stale or phantom stop arrivals are not recorded.

**Why this priority**: Geofence replay generates false "arrived at stop" events on every restart. In the observed session, 34 geofence enters fired within 90ms on cold start — all 5 registered stops triggered simultaneously, multiple times. This corrupts route progress tracking.

**Independent Test**: Kill and restart the tracker app while the device is stationary. Observe that no geofence enter events are recorded during a short grace period after boot, or that duplicate/stale entries from the OS replay are filtered out.

**Acceptance Scenarios**:

1. **Given** the tracker app cold-starts, **When** the OS replays cached geofence enter events within the first seconds of boot, **Then** those events are suppressed (not logged or forwarded).
2. **Given** the app has been running for longer than the grace period after a cold start, **When** the device genuinely enters a geofence region, **Then** the event is processed normally.
3. **Given** multiple geofence enters for the same stop arrive within a short window, **When** the dedup check runs, **Then** only the first event is recorded regardless of whether the buffer has been persisted yet.

---

### Edge Cases

- What happens when the flush lock is held and the app is killed by the OS mid-flush? The lock must not persist across process restarts (in-memory only), so a new process starts with an unlocked state.
- What happens when the device has no network on startup? Buffered pings should remain in the buffer; the flush should fail gracefully without triggering backoff (backoff is for server rejection, not network unavailability).
- What happens when the backoff delay exceeds the OS background task execution window? The backoff state must persist across task invocations so the next callback respects the remaining cooldown.
- What happens when geofences are re-registered during the boot grace period? The grace period should apply to event callbacks, not to registration — regions should still be registered promptly so real events after the grace window are captured.
- What happens if the app receives a 429 on the single-point send but the batch flush succeeds (or vice versa)? Both paths must share the same backoff state to prevent one path from bypassing the cooldown set by the other.

## Clarifications

### Session 2026-03-13

- Q: Should a second flush request queue behind an in-progress flush or be skipped entirely? → A: Skip — drop the concurrent flush; next callback retries naturally.
- Q: What should the default geofence cold-start grace period be? → A: 15 seconds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The flush operation MUST be serialized — only one flush may execute at a time within the background task process.
- **FR-002**: If a flush is already in progress when another is requested, the second request MUST be skipped (not queued or executed concurrently). The next natural location callback will retry the flush if the buffer is non-empty.
- **FR-003**: The flush concurrency guard MUST be in-memory only, so it does not persist across process restarts and cannot cause deadlocks.
- **FR-004**: When a single-point send receives a 429 response, the system MUST apply the same progressive backoff logic already used for 5xx server errors.
- **FR-005**: When a batch flush receives a 429 response, the system MUST apply progressive backoff and retain buffered points for the next retry cycle.
- **FR-006**: The backoff state (consecutive failure count and next-retry timestamp) MUST persist across background task invocations so that the cooldown is respected even if the task process is recycled.
- **FR-007**: On a successful send after backoff, the consecutive failure count and backoff timer MUST reset to zero.
- **FR-008**: The geofence event handler MUST suppress enter events that arrive within a configurable grace period (default 15 seconds) after a cold start.
- **FR-009**: The geofence dedup check MUST work correctly even when multiple events arrive faster than the buffer can be persisted (e.g., use an in-memory set in addition to the persisted buffer).
- **FR-010**: The cold-start grace period MUST NOT delay geofence region registration — only event processing should be deferred.

### Key Entities

- **Flush lock**: In-memory flag or promise that serializes flush operations within a single process lifetime.
- **Backoff state**: Consecutive failure count and next-retry timestamp, persisted across task invocations, consulted before every send attempt.
- **Boot timestamp**: The time of the most recent cold start, used to calculate the geofence grace window.
- **Geofence dedup set**: In-memory map of recent geofence entries that supplements the persisted event buffer for rapid-fire dedup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: During a tracking session that starts with buffered pings, the total number of pings sent to the server in the first minute does not exceed 2x the actual buffer size (no duplicate batch sends).
- **SC-002**: After receiving a rate-limit response, no retry attempt occurs for at least 5 seconds, and subsequent retries space out progressively.
- **SC-003**: During a cold start, zero geofence enter events are recorded within the first 15 seconds, even if the OS delivers replay events.
- **SC-004**: Over a full-day tracking session, the flush success rate is above 90% (excluding periods of genuine network unavailability).
- **SC-005**: Buffered pings are never lost — points that cannot be sent immediately remain in the buffer until successfully delivered or aged out by the existing TTL.
