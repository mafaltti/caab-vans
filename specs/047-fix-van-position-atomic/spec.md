# Feature Specification: Atomic Van Position Update with GPS Device Timestamp

**Feature Branch**: `047-fix-van-position-atomic`
**Created**: 2026-03-07
**Status**: Implemented
**Input**: Findings #1 and #2 from tracking system audit (doc 0073)

## Clarifications

### Session 2026-03-07

- Q: What should consumers do when GPS fix time is NULL (pre-backfill or new van)? → A: Backfill GPS fix time from historical ping data at migration time, so NULL is only for truly new vans.

## Context

Two critical issues were identified in the GPS tracking ingest pipeline:

1. **Wrong timestamp on van position**: The `vans` table stores server arrival time as `location_updated_at`, not the actual GPS fix time from the device. All downstream consumers (ETA, freshness checks, "is running" logic) treat this field as GPS recency, leading to stale positions being treated as fresh — especially after offline buffer flushes.

2. **Race-prone position projection**: Concurrent GPS pings can both read the same "previous latest" snapshot, both decide they are newest, and both unconditionally overwrite the van's position. Whichever writes last wins, even if it carries an older GPS timestamp. There is no atomic guard preventing position regression.

Both issues share the same fix surface: a single atomic database operation that writes the device's GPS timestamp and only updates the position if the incoming timestamp is strictly newer than the stored one.

## User Scenarios & Testing

### User Story 1 — Accurate Position Freshness After Offline Flush (Priority: P1)

A van loses cellular connectivity for an extended period. When connectivity returns, the device flushes a batch of buffered GPS pings. The system must correctly reflect the actual GPS recency — not the server receipt time — so that downstream consumers (ETA, freshness badges, "is running" gate) make decisions based on real GPS age.

**Why this priority**: This is the root cause of incorrect ETA calculations and misleading freshness indicators. It affects every user viewing route status after any network interruption.

**Independent Test**: Can be tested by sending a batch of old GPS pings (e.g., device timestamps from 2 hours ago) and verifying that the van's GPS recency field reflects 2 hours ago, not "just now."

**Acceptance Scenarios**:

1. **Given** a van with no prior position, **When** a GPS ping arrives with device timestamp T, **Then** the van's GPS recency is recorded as T (not server clock).
2. **Given** a van with last GPS fix at 14:00, **When** a batch of pings from 14:00-15:50 arrives at 15:52 server time, **Then** the van's GPS recency is 15:50 (latest device timestamp), not 15:52.
3. **Given** a van with last GPS fix at 14:00, **When** a batch of stale pings from 10:00-10:04 arrives at 14:20 server time, **Then** the van's GPS recency remains 14:00 (the newer value), and position coordinates are not overwritten.

---

### User Story 2 — Race-Safe Position Updates Under Concurrent Pings (Priority: P1)

When two or more GPS pings for the same van are processed concurrently, the system must guarantee that only the ping with the newest GPS timestamp updates the van's current position. Position must never regress to an older GPS fix.

**Why this priority**: Position regression causes the van to "jump backward" on the map and corrupts ETA calculations. This can happen during normal operation with rapid ping intervals or batch flushes.

**Independent Test**: Can be tested by sending two concurrent pings with different device timestamps and verifying only the newer one's coordinates are stored on the van.

**Acceptance Scenarios**:

1. **Given** a van at position A with GPS fix at 10:00:00, **When** two pings arrive concurrently — Ping X (10:01:00, position B) and Ping Y (10:00:30, position C), **Then** the van's position is B and GPS recency is 10:01:00, regardless of processing order.
2. **Given** a van at position A with GPS fix at 10:00:00, **When** a ping with device timestamp 09:59:00 arrives, **Then** the van's position remains A and GPS recency remains 10:00:00 (no regression).
3. **Given** a van with no prior position (first ping ever), **When** a ping arrives, **Then** the position is always accepted and stored.

---

### User Story 3 — Correct Freshness in Consumer Systems (Priority: P2)

All systems that evaluate GPS freshness (ETA computation, route status API, tracker health monitoring) must use the actual GPS device timestamp rather than server receipt time. This ensures accurate staleness detection.

**Why this priority**: Dependent on Story 1 being implemented. Without correct freshness data, ETA falls back to schedule-based estimates unnecessarily or, worse, uses stale GPS data as if it were fresh.

**Independent Test**: Can be tested by querying the route status API after ingesting a ping with a known device timestamp and verifying the freshness/age calculation matches the device timestamp, not the server time.

**Acceptance Scenarios**:

1. **Given** a GPS ping ingested with device timestamp 30 minutes ago, **When** the ETA system evaluates GPS age, **Then** it computes age as ~30 minutes (not ~0 minutes).
2. **Given** a GPS ping ingested with device timestamp 2 minutes ago, **When** the freshness check runs, **Then** it reports the position as fresh (within threshold).
3. **Given** no GPS pings received for a van, **When** a consumer checks GPS recency, **Then** it treats the position as stale/unavailable.

---

### Edge Cases

- **First ping for a van**: No prior GPS fix exists. The position must always be accepted regardless of timestamp.
- **Duplicate device timestamps**: Two pings with identical `device_ts` values. The first one processed wins; the second is a no-op (no regression, no error).
- **Clock skew on device**: Device timestamp is slightly in the future relative to server time. The system accepts it (device timestamps are already clamped in existing validation).
- **Null GPS fix time field**: Existing vans are backfilled at migration time from historical pings. Only truly new vans (no ping history) will have NULL. Any incoming ping populates it unconditionally when NULL (per FR-003).
- **Batch with mixed old and new pings**: Only the newest ping in the batch should update the van's position; older pings in the same batch must not overwrite a newer one.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST store the GPS device timestamp (not server time) as the van's last GPS fix time when updating the van's current position.
- **FR-002**: The system MUST atomically update the van's position only when the incoming GPS device timestamp is strictly newer than the currently stored GPS fix time.
- **FR-003**: The system MUST accept a position update unconditionally when no prior GPS fix time is stored for the van (first ping or null state).
- **FR-004**: The system MUST continue storing server receipt time separately for administrative/audit purposes (existing `location_updated_at` behavior preserved).
- **FR-005**: All GPS freshness consumers (ETA computation, route freshness checks, tracker health) MUST use the GPS device timestamp — not server receipt time — for age/staleness calculations.
- **FR-006**: The system MUST return a signal to the caller indicating whether the position was actually updated (newer) or skipped (older/duplicate), so that downstream processing (e.g., stop-progress inference) only runs when the position changed.
- **FR-007**: Batch ingest MUST identify the newest ping in the batch and attempt a single position update with that ping's timestamp and coordinates.
- **FR-008**: The migration MUST backfill GPS fix time for all existing vans from their most recent historical ping's device timestamp, so that only truly new vans (with no ping history) have a NULL GPS fix time.

### Key Entities

- **Van Position**: The van's current GPS coordinates (latitude, longitude), accuracy, speed, heading, snapped coordinates, GPS fix time, and server update time.
- **GPS Ping**: An individual location report from the tracking device, containing device timestamp, coordinates, accuracy, speed, and heading.
- **GPS Fix Time**: The timestamp from the GPS device indicating when the position was actually determined (as opposed to when the server received it).

## Success Criteria

### Measurable Outcomes

- **SC-001**: After an offline buffer flush, the reported GPS age matches the actual age of the newest GPS fix within 1 second of accuracy (not the server receipt time).
- **SC-002**: Under concurrent ping processing, the van's stored position never regresses to an older GPS fix — verified by the stored GPS fix time being monotonically non-decreasing.
- **SC-003**: ETA calculations use correct GPS age, eliminating false "fresh GPS" determinations that previously caused inaccurate ETAs after connectivity gaps.
- **SC-004**: The existing server receipt timestamp remains available for administrative queries (no data loss for audit purposes).

## Assumptions

- The existing `device_ts` clamping logic (preventing future timestamps) remains in place and is not modified by this feature.
- The GPS ping audit log (`van_location_pings` table) continues to store all pings regardless of whether they update the van's current position.
- The van tracking device correctly reports GPS timestamps; device clock accuracy is outside the scope of this feature.
- The existing snapping-to-road behavior is unchanged — only the timestamp and atomicity of the van position update are affected.
