# Feature Specification: Fix ETA Computation

**Feature Branch**: `044-fix-eta-computation`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Fix ETA computation: use OSRM duration, handle speed=0, smooth speed fallback"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Van Stopped Near a Stop Still Shows Accurate ETA (Priority: P1)

When a van is close to a stop but temporarily stationary (e.g., at a traffic light or loading passengers), passengers should see an ETA that reflects the van's proximity rather than an inflated schedule-based fallback.

**Why this priority**: This is the most user-visible problem. A van 860 meters away showing "8 minutes" instead of "~2 minutes" directly erodes passenger trust in the system. When passengers see a wildly wrong ETA, they stop relying on the app entirely.

**Independent Test**: Start a van within 500 meters of a stop with speed at 0. Observe that the displayed ETA reflects the short distance (under 3 minutes) rather than jumping to the schedule-based fallback (8+ minutes).

**Acceptance Scenarios**:

1. **Given** a van is within 500 meters of the next stop and the van's speed is 0, **When** the ETA is computed, **Then** the system uses a proximity-based estimate rather than falling back to schedule-based ETA.
2. **Given** a van is within 500 meters of the next stop and stationary, **When** the ETA is displayed, **Then** it is no greater than 3 minutes (reflecting the short remaining distance at a reasonable fallback speed).
3. **Given** a van is more than 500 meters from the next stop and has speed 0 with no recent movement history, **When** the ETA is computed, **Then** the system falls back to schedule-based ETA (existing behavior preserved for genuinely idle vans far from stops).

---

### User Story 2 - Stable ETAs When Road Routing Data Is Available (Priority: P1)

When the system has access to road routing data, passengers should see stable, road-aware ETAs that do not swing wildly based on momentary speed changes. The same 2.3 km distance should produce a consistent ETA, not a range from 4 to 13 minutes.

**Why this priority**: ETA volatility is as damaging as inaccuracy. Passengers checking the app twice within a minute and seeing ETAs jump from 5 minutes to 13 minutes and back to 4 minutes lose confidence in the information. Road routing services already compute travel time using road-specific speed profiles, providing a far more stable baseline.

**Independent Test**: Monitor the ETA for a given stop over 2 minutes while the van is moving at varying speeds on the same road segment. Confirm the ETA changes smoothly and proportionally to the remaining distance, without sudden jumps greater than 2 minutes between consecutive updates.

**Acceptance Scenarios**:

1. **Given** the system successfully obtains road routing data including travel duration, **When** the ETA is computed, **Then** the travel duration from the routing service is used as the base estimate instead of dividing road distance by instantaneous GPS speed.
2. **Given** the system obtains a routing duration of 3.2 minutes, **When** a congestion adjustment factor is applied, **Then** the displayed ETA is the routing duration multiplied by the adjustment factor (e.g., 3.2 minutes adjusted for typical congestion).
3. **Given** the van is moving on a road segment, **When** consecutive ETA computations occur within 1 minute, **Then** the ETA values do not differ by more than 2 minutes unless the van has meaningfully changed position (moved more than 200 meters).

---

### User Story 3 - Smooth ETAs When Road Routing Is Unavailable (Priority: P2)

When road routing data is temporarily unavailable and the system falls back to straight-line distance estimation, passengers should still see reasonably stable ETAs rather than values that jump erratically with each GPS reading.

**Why this priority**: While road routing availability is the normal case, network issues or service outages can force the system into fallback mode. Using smoothed speed data instead of raw instantaneous readings prevents the worst ETA volatility during these degraded periods.

**Independent Test**: Simulate road routing unavailability while a van is in motion. Observe ETAs over 2 minutes and confirm they trend smoothly toward zero as the van approaches a stop, without erratic jumps.

**Acceptance Scenarios**:

1. **Given** road routing data is unavailable and the van is moving, **When** the ETA is computed using straight-line distance, **Then** the speed used for the calculation is a smoothed average of recent readings rather than the single most recent instantaneous GPS speed.
2. **Given** a van decelerates briefly (e.g., speed drops from 40 km/h to 10 km/h for one reading then returns to 35 km/h), **When** the fallback ETA is computed, **Then** the brief deceleration does not cause the ETA to spike by more than 50% compared to the previous computation.
3. **Given** no recent speed readings are available (all recent pings have speed 0 or null), **When** the fallback ETA is computed, **Then** the system uses the same proximity-aware fallback as described in User Story 1 for nearby stops, or schedule-based ETA for distant stops.

---

### Edge Cases

- What happens when the van has been stationary for a long time (e.g., parked for 30+ minutes) and is within 500 meters of a stop? The proximity-based ETA should still apply, showing a short estimate, since the van is genuinely close. The schedule-based fallback only activates for stops that are far away.
- What happens when the congestion adjustment factor makes the routing-based ETA longer than the schedule-based ETA? The system should display the routing-based ETA, as it reflects real road conditions. A routing-based ETA exceeding the schedule-based one indicates unusual congestion, which is still valuable information for the passenger.
- What happens when the van is exactly at 500 meters from the stop with speed 0? The proximity threshold is inclusive — the proximity-based fallback applies at distances of 500 meters or less.
- What happens when speed readings are available but all are 0 (e.g., van stuck in heavy traffic for several minutes)? The smoothed average will be 0, so the system should apply the same proximity-aware or schedule-based fallback logic rather than attempting to divide by zero.
- What happens if only 1 or 2 speed readings exist (e.g., shortly after the van started its route)? The smoothed average should use whatever readings are available; it does not require a full window of readings to produce a result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute a proximity-based ETA for stops within 500 meters of the van when the van's speed is 0, using a fallback speed of approximately 15 km/h (~4.2 m/s) rather than skipping GPS-based computation entirely.
- **FR-002**: System MUST use the travel duration provided by the road routing service as the base ETA when road routing data is successfully obtained, instead of dividing road distance by instantaneous GPS speed.
- **FR-003**: System MUST apply a congestion adjustment factor to the routing-service travel duration to account for real-world conditions not reflected in static road speed profiles.
- **FR-004**: System MUST use a smoothed speed value (rolling average of the 10 most recent GPS readings, covering approximately 50 seconds at 5-second ping intervals) instead of instantaneous GPS speed when computing fallback ETAs without road routing data.
- **FR-005**: System MUST continue to fall back to schedule-based ETA when the van is more than 500 meters away and has no usable speed data (speed is 0 with no recent movement history and no road routing available).
- **FR-006**: System MUST NOT allow ETA computation to produce division-by-zero errors when all available speed readings are 0.
- **FR-007**: These changes MUST only affect ETA display values. Geofence detection, route tracking, stop advancement, and all other system behaviors MUST remain unchanged.

### Key Entities

- **ETA Estimate**: The computed arrival time shown to passengers for each upcoming stop — may be derived from road routing duration, proximity-based fallback, smoothed GPS speed, or schedule data.
- **Road Routing Result**: Data returned by the routing service for a given origin-destination pair, including both road distance and travel duration.
- **Smoothed Speed**: A rolling average of the 10 most recent GPS speed readings (~50 seconds at 5-second intervals) from the van, used to dampen instantaneous volatility in fallback ETA calculations.
- **Congestion Adjustment Factor**: A multiplier applied to routing-service travel durations to account for real-time traffic conditions not captured by static road speed data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a van is within 500 meters of a stop and stationary, the displayed ETA is no greater than 3 minutes (previously could show 8+ minutes due to schedule-based fallback).
- **SC-002**: When road routing data is available, consecutive ETA readings for the same stop do not vary by more than 2 minutes within a 1-minute window, unless the van has moved more than 200 meters (previously varied by 8+ minutes due to speed volatility).
- **SC-003**: When road routing data is unavailable, a brief speed fluctuation (single reading deviating by more than 50% from the trend) does not cause the displayed ETA to change by more than 50% from the previous value.
- **SC-004**: No existing ETA behavior regresses for vans that are moving at normal speeds with road routing available — ETAs remain accurate and responsive to the van's actual progress along the route.
- **SC-005**: Geofence detection, stop advancement, route start/end, and all non-ETA system behaviors are completely unaffected by these changes.

## Assumptions

- The congestion adjustment factor remains valuable even when using routing-service travel durations, because routing services typically compute durations using static road speed profiles rather than real-time traffic data.
- A 500-meter proximity threshold for allowing GPS-based ETA at speed 0 is appropriate for the urban/suburban routes in this system. Stops farther than 500 meters from a stationary van are better served by schedule-based estimates. The fallback speed of ~15 km/h reflects typical van movement in Salvador urban traffic after a brief stop.
- A rolling average of the 10 most recent speed readings (~50 seconds at 5-second ping intervals) provides sufficient smoothing to eliminate the worst ETA volatility without introducing unacceptable lag in ETA responsiveness.
- These fixes address ETA display quality only. The underlying GPS data collection, geofencing, and route tracking logic is correct and does not need modification.

## Clarifications

### Session 2026-03-06

- Q: What fallback speed should be used for stationary vans within 500m of a stop? → A: ~15 km/h (~4.2 m/s) — moderate urban speed, produces ~2 min ETA for 500m, comfortably satisfies SC-001.
- Q: How many recent pings should the smoothed speed rolling average use? → A: 10 most recent pings (~50 seconds at 5-second ping intervals) — provides solid smoothing without meaningful lag.

## Scope Boundaries

**In scope**:
- Allowing proximity-based ETA computation when the van is near a stop but stationary
- Using routing-service travel duration as the primary ETA source when available
- Applying congestion adjustment to routing-service durations
- Smoothing GPS speed for fallback ETA calculations
- Handling edge cases around zero speed and missing data

**Out of scope**:
- Changes to geofence detection or stop advancement logic
- Changes to GPS data collection or filtering in the tracker app
- Integration of real-time traffic data feeds
- Changes to the routing service configuration or deployment
- Modifications to schedule-based ETA logic (used as final fallback, unchanged)
- UI changes to how ETAs are displayed to passengers
