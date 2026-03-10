# Feature Specification: Fix Rate-Limit 429 Cascade

**Feature Branch**: `061-fix-rate-limit-cascade`
**Created**: 2026-03-10
**Status**: Draft
**Input**: User description: "Fix rate-limiting 429 cascade causing multi-minute van tracker blackouts. Implement Approach E: (1) Server: raise tracking rate limit from 25 to 40 req/min per van, (2) Tracker: buffer 429'd pings instead of dropping them, (3) Tracker: don't increment consecutiveFailures on 429 responses to prevent backoff spiral."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Raise Server Rate Limit (Priority: P1)

A van (e.g., Van 02) sends GPS pings every 2 seconds while moving, reaching ~25 pings/minute. Today this hits the server ceiling and triggers 429 responses. By raising the server-side limit to 40 requests/minute per van, the van's peak throughput fits comfortably within the allowed window, and the map stays live without interruption.

**Why this priority**: This is the only change that can be deployed immediately on the server without requiring a tracker app update. It directly stops the bleeding for existing devices in the field.

**Independent Test**: Deploy the server change alone. Monitor Van 02 during a moving route — confirm zero 429 responses and no map blackouts during peak ping rates (~25/min).

**Acceptance Scenarios**:

1. **Given** a van sending 25 pings/minute, **When** all pings arrive at the tracking endpoint, **Then** all are accepted (no 429 responses).
2. **Given** a van sending 41+ pings/minute (above the new limit), **When** the limit is exceeded, **Then** excess requests receive a 429 response.
3. **Given** 4 vans each sending 40 pings/minute simultaneously (160 req/min total), **When** all pings arrive, **Then** the server processes them without connection exhaustion or degraded response times.

---

### User Story 2 — Buffer Rate-Limited Pings Instead of Dropping (Priority: P2)

When the tracker app receives a 429 response for a single ping, the GPS point is currently discarded — permanently lost. Instead, the tracker should save the rejected point to its local buffer so it can be retried in the next batch flush. This preserves location data continuity even when the rate limit is temporarily exceeded.

**Why this priority**: Prevents permanent data loss. Even with the raised limit, edge cases (new devices, bursts) can still trigger 429s. Buffering ensures no GPS data is lost.

**Independent Test**: With the server rate limit temporarily lowered (or by simulating rapid pings), confirm that 429'd points appear in the local buffer and are successfully flushed to the server on the next batch cycle.

**Acceptance Scenarios**:

1. **Given** a tracker app that receives a 429 response for a single ping, **When** the ping is rejected, **Then** the GPS point is added to the local buffer (not discarded).
2. **Given** buffered 429'd points exist, **When** the next successful send occurs and buffer flush runs, **Then** the previously rejected points are delivered to the batch endpoint.
3. **Given** the buffer is at capacity (100 points), **When** a new 429'd point arrives, **Then** the oldest point is evicted per existing FIFO policy (no crash or data corruption).

---

### User Story 3 — Prevent Backoff Spiral on 429 (Priority: P2)

A 429 response is flow-control, not a server error. Today the tracker treats it identically to a 500: it increments the failure counter and enters exponential backoff (5s → 10s → 30s → 1min → 2min → 5min), causing multi-minute blackouts. The tracker should not escalate its backoff on 429 responses — it should continue sending at its normal rate and simply buffer the rejected point.

**Why this priority**: Same priority as US2 — together they form the client-side safety net. Without this fix, a single 429 during buffer flush still triggers the catastrophic backoff spiral that causes minutes of silence.

**Independent Test**: Simulate a 429 from the server. Confirm the tracker does not increment its failure counter, does not enter backoff, and resumes normal pinging on the next cycle.

**Acceptance Scenarios**:

1. **Given** the tracker receives a 429 on a single-ping send, **When** the response is processed, **Then** the failure counter is not incremented and no backoff delay is scheduled.
2. **Given** the tracker receives a 429 during a batch buffer flush, **When** the response is processed, **Then** the failure counter is not incremented, the buffer is kept intact for later retry, and no backoff delay is scheduled.
3. **Given** the tracker has 0 consecutive failures and receives a 429, **When** the next location callback fires, **Then** the tracker sends immediately (no backoff wait).
4. **Given** the tracker is already in backoff from a prior server error and then receives a 429, **When** the 429 is processed, **Then** the existing backoff state is not further escalated.

---

### Edge Cases

- What happens if a van sends pings faster than 40/min due to a new device or firmware change? The 429 is returned, the point is buffered, and no backoff spiral occurs — the tracker self-recovers on the next cycle.
- What happens if the tracker app is updated but the server rate limit has not been raised yet (staggered rollout)? The client-side changes (buffer + no backoff) still improve behavior: rejected points are preserved and the tracker doesn't go dark for minutes.
- What happens if the batch flush request itself gets a 429? The buffer is kept intact and retried on the next cycle without escalating backoff.
- What happens if a device has persisted backoff state from before the app update? Old backoff-until and failure-count values are hydrated on cold start. The new 429 logic only affects future 429 responses — existing backoff from prior server errors is still respected and will naturally expire.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST accept up to 40 tracking requests per minute per van on the single-ping endpoint.
- **FR-002**: The server MUST accept up to 40 tracking requests per minute per van on the batch endpoint.
- **FR-003**: The tracker app MUST add the GPS point to the local buffer when a single-ping request receives a 429 response (instead of discarding it).
- **FR-004**: The tracker app MUST NOT increment its failure counter when a 429 response is received (single-ping or batch flush).
- **FR-005**: The tracker app MUST NOT schedule a backoff delay when a 429 response is received.
- **FR-006**: The tracker app MUST keep buffered points intact when a batch flush receives a 429, retrying on the next flush cycle.
- **FR-007**: The server MUST continue returning 429 with appropriate status when the per-van rate limit is exceeded.
- **FR-008**: Operations and API contract documentation MUST be updated to reflect the new 40/min rate limit.

### Key Entities

- **Rate limiter (server)**: In-memory sliding-window counter, keyed by van ID. Configuration: window duration and max requests per window.
- **Backoff state (tracker)**: Consecutive failure count and backoff-until timestamp. Persisted across app restarts. Only incremented on true server errors, not on flow-control responses (429).
- **Location buffer (tracker)**: FIFO queue of GPS points (max 100, 24h TTL). Holds points that could not be delivered due to rate limiting, network errors, or server errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Vans sending up to 30 pings/minute experience zero 429 rejections during normal operation.
- **SC-002**: No multi-minute map blackouts caused by rate-limit backoff spirals — maximum gap between visible position updates is under 30 seconds during active tracking.
- **SC-003**: Zero permanent GPS data loss from rate-limiting — all 429'd points are recovered via buffer flush within 2 minutes.
- **SC-004**: Server handles 160 requests/minute (4 vans at peak) without connection exhaustion or response time degradation beyond 500ms p95.

## Assumptions

- The current peak ping rate across all known devices is ~25/min (Van 02). The 40/min limit provides 60% headroom.
- The existing buffer mechanism (max 100 points, 24h TTL, FIFO eviction) is sufficient for handling temporary 429 bursts.
- The ingest endpoint rate limit of 10/min is unrelated and remains unchanged.
- Server capacity (16/100 DB connections, 3% CPU) can absorb the increased throughput.

## Deployment Strategy

- **Phase 1 (server-only, immediate)**: Raise rate limit from 25 to 40/min. No app update required. Fixes all current devices.
- **Phase 2 (next tracker build)**: Buffer 429'd pings + remove backoff on 429. Requires app update deployed to devices.
- Both phases are independently valuable and can be deployed and validated separately.
