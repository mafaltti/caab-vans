# Feature Specification: OSRM Configurable Timeouts

**Feature Branch**: `050-osrm-configurable-timeouts`
**Created**: 2026-03-07
**Status**: Draft
**Input**: Finding #5 from tracking system audit (doc 0073) — OSRM timeouts too aggressive for production

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator configures OSRM timeouts for production environment (Priority: P1)

An operations engineer deploying CAAB Vans needs to tune OSRM timeout values without modifying source code. They set environment variables to match their infrastructure's latency characteristics (e.g., local OSRM on the same VPS vs. a remote instance), ensuring the system uses road-aware routing as often as possible instead of silently falling back to less accurate distance estimates.

**Why this priority**: The current hardcoded timeouts (50ms for road snapping, 100ms for route calculation) cause frequent silent fallbacks to lower-quality haversine estimates, directly degrading ETA accuracy and map display quality for all end users. Making timeouts configurable is the core value of this feature.

**Independent Test**: Can be fully tested by setting the environment variables to different values and verifying that the OSRM client respects those values when making requests.

**Acceptance Scenarios**:

1. **Given** the environment variables are set to custom timeout values, **When** the OSRM client makes a request, **Then** it uses the configured timeout instead of a hardcoded default.
2. **Given** no environment variables are set, **When** the OSRM client makes a request, **Then** it uses sensible default values that are more generous than the current hardcoded ones.
3. **Given** an invalid (non-numeric or negative) value is set for a timeout variable, **When** the application starts, **Then** it falls back to the default value.

---

### User Story 2 - End user receives more accurate ETAs due to fewer OSRM timeouts (Priority: P1)

A parent checking the CAAB Vans portal for their child's van ETA receives a road-distance-based estimate rather than a less accurate straight-line estimate. With more generous default timeouts, the OSRM service responds successfully more often, and the system uses actual road distances for ETA calculations instead of falling back to haversine with a fixed correction factor.

**Why this priority**: This is the end-user-facing benefit that motivates the entire change. More successful OSRM calls directly translate to better ETA accuracy, especially on winding roads where haversine fallback can be 40-60% off.

**Independent Test**: Can be tested by comparing the rate of OSRM-based vs haversine-based ETA sources before and after the timeout increase; OSRM success rate should improve.

**Acceptance Scenarios**:

1. **Given** the system is running with the new default timeouts, **When** a van is actively tracked on a route, **Then** the ETA calculation uses OSRM-based road distance more frequently than with the previous hardcoded timeouts.
2. **Given** the OSRM service is healthy and responding within the configured timeout, **When** a road-snapping request is made, **Then** the van's map position is snapped to the road rather than showing raw GPS coordinates.

---

### Edge Cases

- What happens when the environment variable contains a non-numeric string (e.g., `"abc"`)? System uses the default value.
- What happens when the timeout is set to zero or a negative number? System uses the default value.
- What happens when the timeout is set extremely high (e.g., 60000ms)? System respects the value up to the `setTimeout` max (2^31−1 ms) — this is the operator's choice, though it may slow down API responses. Values exceeding the max fall back to the default.
- What happens when the OSRM service is completely down? Behavior is unchanged — the system still falls back to haversine after timeout, same as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow OSRM route-calculation timeout to be configured via an environment variable.
- **FR-002**: System MUST allow OSRM road-snapping (match) timeout to be configured via an environment variable.
- **FR-003**: When no environment variable is set, the system MUST use a default route timeout of 300ms (up from the current 100ms).
- **FR-004**: When no environment variable is set, the system MUST use a default match timeout of 200ms (up from the current 50ms).
- **FR-005**: When an environment variable contains an invalid value (non-numeric, zero, or negative), the system MUST fall back to the default timeout value.
- **FR-006**: The existing fallback behavior (return null on timeout, letting callers use haversine) MUST remain unchanged.

### Key Entities

- **OSRM Client Configuration**: The timeout settings that control how long the system waits for OSRM responses before falling back to haversine-based calculations. Comprises two independent timeout values: one for route calculations (ETA) and one for road-snapping (map accuracy).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can change OSRM timeout behavior without code changes, using only environment variable configuration.
- **SC-002**: With default configuration, the OSRM road-snapping timeout increases from 50ms to 200ms and route timeout from 100ms to 300ms.
- **SC-003**: The rate of successful OSRM responses (non-timeout) improves compared to the previous hardcoded timeouts under equivalent infrastructure conditions.
- **SC-004**: No change to user-facing API response structure or fallback behavior — the feature is transparent to API consumers.

## Assumptions

- The OSRM service runs on the same VPS or local network as the application, making 200-300ms timeouts safe without significantly impacting API response times.
- The existing batch/precompute scripts (which already use 500ms timeouts) are not in scope — they already have adequate timeouts.
- Structured logging improvements (metrics endpoint, timeout counters) are out of scope for this spec and can be addressed separately if needed.
