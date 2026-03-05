# Feature Specification: Fix Duplicate Pings

**Feature Branch**: `039-fix-duplicate-pings`
**Created**: 2026-03-05
**Status**: Draft
**Input**: User description: "Implement all fixes for tracker duplicate pings bug"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Parked Van Stops Flooding the System (Priority: P1)

A van is parked at a terminal for 30 minutes between runs. Today, the system receives ~600 identical location pings during that time (one every 3 seconds). After the fix, the system receives at most 30 pings (one per minute when stationary), and duplicate GPS timestamps are rejected entirely.

**Why this priority**: This is the root cause of the flood. A single parked van generates hundreds of duplicate rows, triggers expensive route calculations on each one, and degrades system performance for all users.

**Independent Test**: Park a van (or simulate stationary GPS) for 10 minutes. Count the pings stored in the database. Should be ~10 (1/min), not ~200.

**Acceptance Scenarios**:

1. **Given** a van is stationary (GPS returns identical coordinates), **When** the tracker app receives callbacks every 3 seconds, **Then** only one ping per minute is sent to the server.
2. **Given** the GPS returns a cached fix with the same timestamp as the last sent ping, **When** the tracker evaluates whether to send it, **Then** the ping is silently dropped.
3. **Given** the device wakes from deep sleep with a GPS fix older than 60 seconds, **When** the tracker evaluates the fix, **Then** it is discarded as stale.

---

### User Story 2 - Server Rejects Duplicate Pings at the Database Level (Priority: P1)

Even if the client sends duplicate pings (due to a bug, old client version, or race condition), the server does not store duplicate rows for the same van and GPS timestamp. Duplicate pings do not trigger expensive downstream processing (route snapping, ETA recalculation, stop inference).

**Why this priority**: This is the safety net. Regardless of client behavior, the database must enforce uniqueness and avoid wasted computation.

**Independent Test**: Send two identical POST requests to the tracking endpoint with the same `van_id` and `device_ts`. Verify only one row exists in the database and the second request returns a "duplicate" acknowledgment without triggering route snapping or stop inference.

**Acceptance Scenarios**:

1. **Given** a ping with `(van_id, device_ts)` already exists in the database, **When** the server receives an identical ping, **Then** it returns success with a duplicate indicator and does not insert a new row.
2. **Given** a ping is inserted, **When** the system checks if it is the newest, **Then** only a strictly newer `device_ts` (not equal) qualifies as "newest."
3. **Given** a ping with a `device_ts` older than 24 hours, **When** the server receives it, **Then** it is rejected with a validation error.

---

### User Story 3 - Tracker Resumes Cleanly After Process Restart (Priority: P2)

When the operating system kills the background tracking process and restarts it, the tracker does not send a burst of unthrottled pings. It restores its previous throttle state (last known position and send time) so the first callback after restart is evaluated against the last successfully sent ping.

**Why this priority**: Cold restarts happen frequently on Android (memory pressure, Doze mode). Without state restoration, each restart causes a burst of duplicate pings until throttle state is rebuilt.

**Independent Test**: Simulate a cold start by clearing module state. Verify the tracker reads persisted coordinates from storage before evaluating the first callback, and does not send a ping if the position hasn't changed.

**Acceptance Scenarios**:

1. **Given** the tracker process was killed by the OS, **When** it restarts and receives the first GPS callback, **Then** it compares against the last persisted position (not null defaults).
2. **Given** persisted state shows the van was at position X, **When** the first callback after restart reports position X, **Then** the ping is suppressed (stationary logic applies).

---

### User Story 4 - Offline Buffer Does Not Accumulate Duplicates (Priority: P2)

When the device is offline, the local buffer does not store consecutive identical location points. On reconnect, only distinct location points are sent to the server, preventing a burst of duplicate requests.

**Why this priority**: Offline buffering is common in areas with poor connectivity. Without deduplication, reconnection causes a spike of 50 identical requests that all hit the server simultaneously.

**Independent Test**: Simulate offline mode. Let the tracker receive 20 identical GPS callbacks. Check the buffer contains only 1 entry. Reconnect and verify only 1 request is sent.

**Acceptance Scenarios**:

1. **Given** the device is offline, **When** the tracker buffers a point with the same coordinates and timestamp as the last buffered point, **Then** the duplicate is not added to the buffer.
2. **Given** the buffer contains 5 distinct points, **When** the device reconnects, **Then** exactly 5 requests are sent (not more).

---

### User Story 5 - Location Freshness Remains Accurate for Parked Vans (Priority: P2)

Parked vans that are actively tracked (tracker app running) continue to show as "location fresh" in the public UI. The reduced ping frequency (1/min when stationary) stays well within the 10-minute freshness threshold.

**Why this priority**: Users must not see "Localização desatualizada" for vans that are actively being tracked, even if parked.

**Independent Test**: Park a van with the tracker running for 15 minutes. Verify the public UI never shows "Localização desatualizada" during that period.

**Acceptance Scenarios**:

1. **Given** a van is parked with the tracker running, **When** a user views the route page, **Then** the location is shown as fresh (not outdated).
2. **Given** the stationary suppression sends 1 ping per minute, **When** the freshness check evaluates `location_updated_at`, **Then** the age is always under 2 minutes (well within the 10-minute threshold).

---

### Edge Cases

- What happens when GPS accuracy degrades below 50m while stationary? Pings are dropped by the existing accuracy filter, but the stationary timer still resets on the next valid fix.
- What happens when the device clock is significantly wrong? The staleness guard (reject fixes where device clock minus GPS timestamp exceeds 60s) may incorrectly drop valid fixes. The 60-second window provides reasonable tolerance for minor clock drift.
- What happens if the unique constraint migration runs on a database with existing duplicates? Existing duplicates must be cleaned up before the constraint is created.
- What happens if the buffer is full (50 entries) with non-duplicate points? The existing FIFO eviction (oldest points dropped) continues to work as before.
- What happens when the van starts moving after being parked? The first callback with changed coordinates passes all filters immediately (distance > 0, new GPS timestamp).

## Requirements *(mandatory)*

### Functional Requirements

**Client-side (tracker app)**

- **FR-001**: System MUST reject GPS fixes whose timestamp matches the last successfully sent timestamp (duplicate `device_ts` guard).
- **FR-002**: System MUST reject GPS fixes older than 60 seconds relative to the device clock (stale fix guard for deep-sleep wake-ups).
- **FR-003**: System MUST suppress stationary pings (distance = 0) to at most one per 60 seconds instead of one per 3 seconds.
- **FR-004**: System MUST restore throttle state (last sent coordinates and time) from persistent storage on cold start, preventing unthrottled bursts after process restart.
- **FR-005**: System MUST deduplicate consecutive identical points in the offline buffer before storing them (same lat, lng, and timestamp).
- **FR-006**: System MUST increase the location callback interval from 3 seconds to 5 seconds and the minimum distance filter from 5 meters to 10 meters, reducing unnecessary wake-ups and cached-fix callbacks at the source.

**Server-side (tracking ingestion)**

- **FR-007**: System MUST enforce a unique constraint on `(van_id, device_ts)` in the location pings table, preventing duplicate rows at the database level.
- **FR-008**: System MUST clean up existing duplicate rows before applying the unique constraint.
- **FR-009**: System MUST use upsert (insert-or-ignore) instead of plain insert, returning a duplicate indicator when a matching row already exists.
- **FR-010**: System MUST only trigger downstream processing (route snapping, van position update, stop inference) when the inserted ping has a strictly newer `device_ts` than the previous latest (not equal).
- **FR-011**: System MUST reject pings with `device_ts` older than 24 hours as stale.

### Key Entities

- **Location Ping**: An immutable GPS fix record with van identifier, device timestamp, coordinates, accuracy, speed, and heading. Uniquely constrained by van identifier and device timestamp.
- **Throttle State**: Client-side state tracking last sent coordinates, wall-clock time, and GPS timestamp. Persisted to survive process restarts.
- **Offline Buffer**: A local FIFO queue (max 50 entries) of unsent pings, with consecutive deduplication.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A stationary van generates no more than 1 location ping per minute (down from ~20/min today).
- **SC-002**: The database contains zero duplicate `(van_id, device_ts)` pairs after the cleanup migration runs.
- **SC-003**: Duplicate ping submissions to the server return successfully without creating new rows or triggering downstream processing.
- **SC-004**: After a tracker process restart, the first ping is evaluated against persisted state (no unthrottled burst).
- **SC-005**: Offline reconnection sends only distinct buffered points (no consecutive duplicates).
- **SC-006**: Parked vans with active trackers never show "Localização desatualizada" in the public UI (location age stays under 2 minutes).
- **SC-007**: Pings older than 24 hours are rejected by the server with a validation error.

## Assumptions

- The 10-minute freshness threshold will not be reduced below 2 minutes (otherwise the 1-minute stationary interval would need adjustment).
- The location background task continues to fire at the configured time interval on Android regardless of distance interval (known Android behavior).
- Persistent local storage is available and reliable for persisting throttle state between process restarts.
- The existing persisted coordinate and timestamp keys are suitable for rehydrating throttle state on cold start.
