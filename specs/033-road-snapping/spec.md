# Feature Specification: Road Snapping for Van GPS Positions

**Feature Branch**: `033-road-snapping`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "Road snapping / map matching for van GPS coordinates — snap van positions to the nearest road to improve map marker accuracy and ETA computation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Van Marker on Map (Priority: P1)

A passenger opens the live tracking map to see where their van is. Currently, the van marker sometimes appears on a building, parking lot, or sidewalk due to GPS inaccuracy (3-15 meters). With road snapping, the van marker always appears on the road surface, giving passengers an accurate and trustworthy view of the van's location.

**Why this priority**: This is the core user-facing problem — inaccurate marker placement undermines user trust in the tracking feature. It is the primary motivation for the entire feature.

**Independent Test**: Open the live tracking map at close zoom levels while a van is operating. The marker should appear on the road, not on adjacent buildings or sidewalks.

**Acceptance Scenarios**:

1. **Given** a van is transmitting GPS coordinates while driving on a road, **When** a passenger views the live map at close zoom, **Then** the van marker appears on the road surface, not on adjacent buildings or sidewalks.
2. **Given** a van is driving along a road that runs parallel to another road, **When** the position is displayed on the map, **Then** the marker appears on the correct road (the one the van is actually on), not the parallel road.
3. **Given** a van is approaching an intersection, **When** the position is displayed on the map, **Then** the marker appears on the road the van is traveling on, not snapped to the wrong road at the intersection.

---

### User Story 2 - Improved ETA Accuracy (Priority: P2)

ETA computation uses van GPS coordinates to estimate time of arrival at upcoming stops. When GPS coordinates are off-road, the distance calculation is less accurate. By using road-aligned coordinates, ETA estimates become more precise and reliable for passengers checking arrival times.

**Why this priority**: ETA accuracy directly affects passenger experience and decision-making (e.g., when to walk to the stop). This improvement comes as a natural side-effect of road snapping with no additional development effort.

**Independent Test**: Compare ETA estimates before and after road snapping is enabled. Road-aligned positions should produce more consistent and accurate ETAs, especially in areas with winding or parallel roads.

**Acceptance Scenarios**:

1. **Given** a van is operating on a route with upcoming stops, **When** ETA is computed using road-snapped coordinates, **Then** the ETA is at least as accurate as (and typically more accurate than) ETAs computed from raw GPS.
2. **Given** a van is on a road that curves away from a stop, **When** ETA is computed, **Then** the distance calculation follows the road geometry rather than being skewed by off-road GPS jitter.

---

### User Story 3 - Graceful Degradation When Snapping Is Unavailable (Priority: P3)

If the road-snapping service is temporarily unavailable (maintenance, crash, resource constraints), the system must continue operating exactly as it does today — using raw GPS coordinates. There must be no user-visible error or degradation beyond returning to pre-feature accuracy.

**Why this priority**: The road-snapping service must not become a single point of failure for the entire tracking system. The system must be resilient and treat snapping as an enhancement, not a hard dependency.

**Independent Test**: Stop the road-snapping service and verify that the tracking system continues to accept GPS data, display van markers on the map, and compute ETAs — all using raw GPS as before this feature existed.

**Acceptance Scenarios**:

1. **Given** the road-snapping service is down, **When** a van transmits GPS coordinates, **Then** the system accepts and stores the coordinates normally and serves them to map consumers without error.
2. **Given** the road-snapping service was down and comes back online, **When** new GPS data arrives, **Then** the system resumes snapping automatically without manual intervention.
3. **Given** the road-snapping service returns an error for a specific GPS coordinate, **When** the system processes that coordinate, **Then** it falls back to the raw GPS value for that specific point.

---

### User Story 4 - Raw GPS Data Preserved for Audit (Priority: P4)

The original, unmodified GPS coordinates must be preserved in the system's location history. This ensures auditability, enables debugging of GPS accuracy issues, and allows future analysis of raw vs. corrected positions.

**Why this priority**: Data integrity and auditability are important but are already satisfied by the existing audit trail (location pings). This story ensures that road snapping does not break that existing guarantee.

**Independent Test**: After road snapping is enabled, verify that the raw GPS audit trail still contains unmodified original coordinates, separate from the corrected positions.

**Acceptance Scenarios**:

1. **Given** a GPS coordinate has been road-snapped, **When** the location history (audit trail) is queried, **Then** the original raw GPS coordinate is still available and unmodified.
2. **Given** road snapping has been active for a period, **When** comparing raw and snapped coordinates in the audit trail, **Then** all raw entries match the original device-reported positions exactly.

---

### Edge Cases

- What happens when a van is in an area not covered by the road network data (e.g., private roads, parking lots, off-road)? The system should fall back to raw GPS for those points.
- What happens when GPS signal is very poor (accuracy > 50m)? The snapping service may not find a match — the system should fall back to raw GPS.
- What happens when a van is stationary for a long time? Snapping should still work correctly for stationary points on a road.
- What happens when the road network data is outdated and a new road exists? The system should fall back to raw GPS for unmatched points and the road data should be refreshable.
- What happens when a van operates on a route with very short road segments? The trajectory-based matching should handle this correctly by using contextual information from surrounding points.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST correct incoming van GPS coordinates to align with the nearest road segment before storing them for display and ETA use.
- **FR-002**: System MUST use trajectory-based matching (considering recent GPS history, not just the single latest point) to resolve ambiguities at intersections and parallel roads.
- **FR-003**: System MUST perform the road-snapping correction at the time of data ingestion, so that all downstream consumers (map, ETA, APIs) automatically receive corrected positions.
- **FR-004**: System MUST store the corrected (road-snapped) position separately from the raw GPS position, preserving both values.
- **FR-005**: System MUST preserve the original raw GPS coordinates in the immutable location history (audit trail) without modification.
- **FR-006**: System MUST fall back to raw GPS coordinates when the road-snapping service is unavailable or returns no match for a given point.
- **FR-007**: System MUST NOT use road-snapped coordinates for geofence detection — geofences must continue using raw GPS to avoid false positives from snapping to an adjacent road.
- **FR-008**: System MUST serve corrected coordinates (when available) to map display and ETA computation consumers, with automatic fallback to raw GPS.
- **FR-009**: System MUST use a self-hosted road-snapping engine with regional road network data, incurring zero per-request cost regardless of fleet size.
- **FR-010**: System MUST support periodic updates to the road network data (at least monthly) without service downtime.
- **FR-011**: The road-snapping correction MUST add no more than 50ms of latency to the GPS data ingestion pipeline.

### Key Entities

- **Van Position (Current)**: The van's latest known location — includes both the raw GPS coordinates from the device and the road-snapped (corrected) coordinates. The corrected values are served to consumers when available; raw values are used as fallback.
- **Location Ping (Audit)**: An immutable record of each raw GPS transmission from a van's device. Contains the original, unmodified coordinates and timestamp. Not affected by road snapping.
- **Road Network Data**: Regional map data covering the service area (Bahia / Nordeste Brazil). Used by the snapping engine to project GPS points onto road segments. Updated periodically.
- **Road-Snapping Service**: An internal service that receives GPS coordinates and returns the nearest point on the road network. Treated as a soft dependency — its unavailability does not affect core system operation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Van marker appears on the road surface (not on buildings, sidewalks, or parking lots) in at least 95% of observations at close zoom levels during normal driving.
- **SC-002**: When the road-snapping service is unavailable, 100% of tracking, map, and ETA functionality continues to operate with no user-visible errors.
- **SC-003**: Road-snapping correction adds less than 50ms to the data ingestion pipeline per GPS point.
- **SC-004**: Zero increase in geofence false-positive or false-negative rates compared to the pre-feature baseline.
- **SC-005**: Road-snapping operates at zero incremental cost per request, regardless of fleet size scaling (4 vans to 50+ vans).
- **SC-006**: Raw GPS audit trail remains 100% intact and unmodified after road snapping is enabled.

## Assumptions

- The service area (Bahia / Nordeste Brazil) has sufficient road network coverage in the available open-source map data for the routes operated by CAAB vans.
- The VPS hosting the system has sufficient resources (4 GB+ RAM, 5 GB+ free disk) to run a self-hosted road-snapping engine alongside existing services.
- Monthly road network data updates are frequent enough for the service area, as road changes are infrequent.
- The current GPS transmission rate (~4 pings/minute) provides enough trajectory context for accurate trajectory-based matching.
- Geofence detection using raw GPS remains accurate and does not need road-snapped coordinates.

## Scope Boundaries

### In Scope

- Correcting van GPS positions to align with roads at ingestion time
- Storing both raw and corrected positions
- Serving corrected positions to map and ETA consumers
- Self-hosted road-snapping engine deployment
- Fallback to raw GPS when snapping is unavailable
- Periodic road network data updates

### Out of Scope

- Snapping historical location pings retroactively
- Client-side road snapping
- Query-time (on-demand) snapping
- Rendering the van's traveled path/trail on the map
- Real-time route matching (showing the van's full route on the map)
- Changes to the map UI component itself
