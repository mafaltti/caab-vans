# Feature Specification: GPS-Distance-Based ETA

**Feature Branch**: `021-gps-distance-eta`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "GPS-distance-based ETA — use the van's real GPS position and speed to estimate arrival at the next stop, falling back to the current schedule-based logic when GPS data is unavailable or unreliable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Live ETA updates between stops (Priority: P1)

As a passenger viewing a van route, I want the estimated arrival time for the next stop to update continuously based on the van's real position and speed, so that I get accurate arrival predictions even when the van is between geofenced stops.

**Why this priority**: This is the core value of the feature. Currently, ETA only updates when the van passes a geofenced stop, leaving passengers with stale estimates while the van is in transit. Real-time GPS-based ETA directly solves this gap.

**Independent Test**: Can be fully tested by tracking a moving van between two stops and observing that the ETA changes as the van progresses — delivers immediate value by showing passengers more accurate arrival times.

**Acceptance Scenarios**:

1. **Given** a van is moving between stops with a fresh GPS position (less than 10 minutes old) and speed above the minimum threshold, **When** a passenger views the route, **Then** the displayed ETA for the next stop reflects the van's current distance and speed rather than the schedule-based estimate.
2. **Given** a van is moving toward the next stop, **When** the van gets closer to that stop over time, **Then** the ETA decreases correspondingly.
3. **Given** a van is using GPS-based ETA, **When** the passenger views the route detail, **Then** the system indicates that the ETA is based on live GPS data.

---

### User Story 2 - Graceful fallback to schedule-based ETA (Priority: P1)

As a passenger, I want the system to automatically fall back to the schedule-based ETA when GPS data is unavailable or unreliable, so that I always see a reasonable estimate regardless of GPS conditions.

**Why this priority**: Equally critical to Story 1 — without reliable fallback, the feature could show no ETA or wildly inaccurate values when GPS data degrades, which would be worse than the current behavior.

**Independent Test**: Can be tested by simulating degraded GPS conditions (stale location, zero speed, missing coordinates) and verifying the system returns a schedule-based ETA instead.

**Acceptance Scenarios**:

1. **Given** a van has no GPS position data available, **When** a passenger views the route, **Then** the ETA is calculated using the existing schedule-based method.
2. **Given** a van's GPS position is older than 10 minutes, **When** a passenger views the route, **Then** the system falls back to the schedule-based ETA.
3. **Given** a van's reported speed is below the minimum threshold (effectively stopped), **When** a passenger views the route, **Then** the system falls back to the schedule-based ETA.
4. **Given** the next stop does not have geographic coordinates, **When** a passenger views the route, **Then** the system falls back to the schedule-based ETA.

---

### User Story 3 - ETA source transparency (Priority: P2)

As a system operator, I want to know which method (GPS or schedule) was used to compute a given ETA, so that I can diagnose issues and understand data quality.

**Why this priority**: Secondary to the core computation but valuable for operational monitoring. Knowing the ETA source helps identify when GPS coverage is poor and informs decisions about route configuration.

**Independent Test**: Can be tested by querying the route data and checking that the response includes the ETA source indicator for each route.

**Acceptance Scenarios**:

1. **Given** a route with GPS-based ETA, **When** the route data is retrieved, **Then** the ETA source is indicated as "gps".
2. **Given** a route using schedule-based fallback, **When** the route data is retrieved, **Then** the ETA source is indicated as "schedule".
3. **Given** a route with no active run, **When** the route data is retrieved, **Then** the ETA source is indicated as empty/null.

---

### Edge Cases

- What happens when the van is essentially at the next stop (distance near zero)? The ETA should be approximately zero minutes.
- What happens when GPS speed is reported but unrealistically high? The system uses the reported speed as-is; speed validation is outside the scope of this feature.
- What happens when the GPS position is fresh but the van speed is exactly at the minimum threshold? The system should use GPS-based ETA (threshold is inclusive: speed >= minimum).
- What happens when a stop's coordinates are partially available (latitude but no longitude, or vice versa)? The system should fall back to schedule-based ETA since a complete coordinate pair is required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute ETA using the van's real-time GPS position and speed when all conditions are met: the van has a fresh GPS position (less than 10 minutes old), the van's speed is at or above a minimum threshold, and the next stop has geographic coordinates.
- **FR-002**: System MUST estimate travel distance using straight-line (haversine) distance multiplied by a road correction factor to approximate real road distance.
- **FR-003**: System MUST compute GPS-based ETA as the current time plus the estimated travel time (corrected distance divided by current speed).
- **FR-004**: System MUST fall back to the existing schedule-based ETA method when any GPS condition is not met (no position, stale position, low speed, or missing stop coordinates).
- **FR-005**: System MUST include an ETA source indicator ("gps", "schedule", or null) in route data so consumers can distinguish the computation method.
- **FR-006**: System MUST return the same ETA values and behavior as today when no GPS position data is provided (backward compatibility).
- **FR-007**: System MUST apply GPS-based ETA consistently across both the route list and route detail endpoints.

### Key Entities

- **Van Position**: The van's current geographic location (latitude, longitude), speed, and the timestamp when the location was last updated.
- **Stop**: A scheduled stop along a route, including optional geographic coordinates (latitude, longitude).
- **ETA Result**: The computed estimated arrival time for the next stop, including the source method used for the computation (GPS-based or schedule-based).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a van is moving between stops with valid GPS data, the displayed ETA updates based on real position and speed rather than remaining static until the next geofence event.
- **SC-002**: 100% of existing ETA calculations continue to produce the same results when GPS data is not available (zero regression).
- **SC-003**: The system correctly falls back to schedule-based ETA within the same request when GPS conditions are not met — no errors, no missing data.
- **SC-004**: ETA accuracy improves for in-transit segments: GPS-based ETA reflects actual distance to the next stop rather than relying solely on schedule offsets.

## Assumptions

- The van's GPS speed is reported in meters per second and is reasonably accurate when above the minimum threshold.
- Haversine distance with a fixed road correction factor (1.3x) provides a sufficiently accurate approximation for the routes in this system. Fine-tuned routing or road-network distance is not needed at this stage.
- A 10-minute staleness threshold for GPS position is appropriate for the operational context (urban/suburban van routes).
- A minimum speed threshold of approximately 1 m/s (~3.6 km/h) is appropriate for distinguishing a moving van from a stopped or idling van.
- Stop geographic coordinates already exist in the database for most stops. Stops without coordinates will gracefully use the schedule-based fallback.
- The frontend does not need changes — it already displays the ETA value, and the ETA source indicator is informational for API consumers.

## Scope Boundaries

**In scope**:
- GPS-based ETA computation with haversine distance and road factor
- Fallback logic to schedule-based ETA
- ETA source indicator in API responses
- Both route list and route detail API endpoints

**Out of scope**:
- Road-network routing or turn-by-turn distance calculation
- GPS speed validation or anomaly detection
- Frontend UI changes
- Changes to GPS data ingestion or geofence detection
- Historical ETA accuracy tracking or analytics
