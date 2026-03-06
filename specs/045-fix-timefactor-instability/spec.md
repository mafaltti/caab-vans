# Feature Specification: Fix timeFactor Instability in ETA Computation

**Feature Branch**: `045-fix-timefactor-instability`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Fix timeFactor instability by replacing instantaneous speed with fixed reference speed in recentRuns computation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stable ETA Display (Priority: P1)

As a passenger viewing the van tracking dashboard, I want the displayed ETA to remain stable and not swing wildly between refreshes, so I can trust the arrival estimate and plan accordingly.

**Why this priority**: This is the core user-facing problem. ETA swings of 10-30 minutes within seconds destroy user trust and make the tracking feature unreliable.

**Independent Test**: Can be tested by observing ETA values across consecutive dashboard refreshes for the same van/stop pair. Delivers stable, trustworthy arrival estimates.

**Acceptance Scenarios**:

1. **Given** a van is in transit heading to a stop, **When** the dashboard refreshes ETA multiple times within a 30-second window, **Then** the displayed ETA does not vary by more than 1 minute between consecutive refreshes (assuming no new stops are passed).
2. **Given** a van passes a new stop during transit, **When** the timeFactor is recomputed with updated actual travel data, **Then** the ETA adjusts smoothly to reflect the new information without abrupt jumps.
3. **Given** a van is far from the next stop (longer route segment), **When** the ETA is computed, **Then** the timeFactor-induced variation remains proportionally small and does not cause multi-minute oscillations.

---

### User Story 2 - Accurate Traffic Correction (Priority: P2)

As a system computing ETAs, the timeFactor correction should still accurately reflect real traffic conditions (slower or faster than baseline), even though it no longer uses instantaneous speed.

**Why this priority**: Stability without accuracy is not useful. The fix must preserve the ability to detect and correct for traffic congestion or free-flow conditions.

**Independent Test**: Can be tested by comparing predicted ETA against actual arrival time for completed route runs. The timeFactor should still improve accuracy over raw OSRM duration alone.

**Acceptance Scenarios**:

1. **Given** a van is traveling through congested traffic (actual segment times exceed baseline predictions), **When** timeFactor is computed from passed stops, **Then** the factor correctly increases the ETA to account for slower-than-expected travel.
2. **Given** a van is traveling through free-flow traffic (actual segment times are below baseline predictions), **When** timeFactor is computed from passed stops, **Then** the factor correctly decreases the ETA to reflect faster-than-expected travel.
3. **Given** the van has passed multiple stops with varying traffic conditions, **When** the median ratio is computed, **Then** the result reflects the overall traffic trend, not instantaneous speed noise.

---

### Edge Cases

- What happens when a van has passed zero or one stop (no inter-stop pairs available)? The timeFactor should default to the historical factor only (no recent blending).
- What happens when the haversine distance between two consecutive stops is extremely short (< 50 meters)? Very short segments may produce unreliable ratios and should be filtered out.
- What happens when `actualMinutes` between two stops is near zero (e.g., two stops passed almost simultaneously due to geofence overlap)? These entries should be excluded to avoid division artifacts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST use a constant reference speed (not dependent on current GPS readings) when computing `predictedMinutes` for each passed stop pair in the `recentRuns` array.
- **FR-002**: The reference speed MUST be the same value across all API calls for the same route run, ensuring that `actual / predicted` ratios only change when a new stop is actually passed.
- **FR-003**: The system MUST continue to blend the recent factor with the historical factor using the existing weight formula (70% historical / 30% recent).
- **FR-004**: The system MUST exclude inter-stop segments where the haversine distance is below 100 meters to avoid unreliable ratios from near-zero distances.
- **FR-005**: The system MUST exclude inter-stop segments where the actual travel time is below 30 seconds to avoid division artifacts from near-simultaneous stop passages.
- **FR-006**: The existing ETA logging MUST continue to include the `timeFactor` value so that stability improvements can be verified from production logs.

### Key Entities

- **Recent Run (inter-stop segment)**: A pair of consecutively passed stops with measured actual travel time and a baseline-predicted travel time. Used to derive the traffic correction ratio.
- **Time Factor**: A multiplier applied to the base ETA (from OSRM duration or distance/speed) that corrects for current traffic conditions. Derived from blending historical patterns (70%) with recent observed ratios (30%).
- **Reference Speed**: A fixed constant speed value used solely for computing baseline predictions in the recentRuns ratio. Its absolute value is unimportant — only consistency across API calls matters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a van in continuous transit (no new stops passed), consecutive ETA values within a 30-second window vary by no more than 1 minute.
- **SC-002**: The `timeFactor` value logged across consecutive API calls (same stop set) varies by no more than 5% (compared to the current 26%+ range observed in production).
- **SC-003**: ETA accuracy (predicted vs. actual arrival time) remains within the same error range as before the fix, or improves — the fix must not degrade prediction quality.
- **SC-004**: No additional external service calls (e.g., OSRM) are introduced by this change — the fix has zero additional network overhead.

## Assumptions

- A fixed reference speed of approximately 30 km/h (8.3 m/s) is a reasonable urban baseline for the routes served. The exact value does not affect correctness because it cancels out in the ratio — only its constancy matters.
- The existing 70/30 blend ratio between historical and recent factors is appropriate and does not need adjustment as part of this fix.
- The ROAD_FACTOR constant (1.3) used in the prediction formula remains appropriate and does not need modification.
