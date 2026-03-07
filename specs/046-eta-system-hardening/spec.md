# Feature Specification: ETA System Hardening

**Feature Branch**: `046-eta-system-hardening`
**Created**: 2026-03-06
**Status**: Draft
**Input**: Comprehensive audit of ETA computation pipeline identifying 11 gaps and improvement opportunities

## Clarifications

### Session 2026-03-06

- Q: How does the hysteresis grace period track state across stateless API requests? → A: Infer from existing recent pings — if any ping within the last 60 seconds had speed >= 1.0 m/s, the system keeps GPS mode. No new database columns or external cache needed.
- Q: How does runtime congestion calibration use OSRM distances without adding latency to the route API? → A: Pre-compute OSRM distances for fixed stop pairs and cache them. Since routes have fixed stops, the distance between consecutive pairs never changes. Compute once and store, adding zero latency to the hot path.
- Q: When direction detection identifies the van is moving away (haversine fallback), should the system apply a penalty multiplier or fall back to schedule? → A: Fall back to schedule-based ETA. When the routing service is unavailable and heading indicates wrong direction, the haversine distance is fundamentally unreliable -- schedule delay from the last passed stop is a safer estimate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stable ETA During Stop-and-Go Traffic (Priority: P1)

A passenger checking the dashboard sees a smooth, trustworthy ETA countdown that does not jump erratically when the van stops at traffic lights or for passenger boarding. Today, the ETA can swing from "~3 min" to "~12 min" and back within 15 seconds because the system abruptly switches between GPS-based and schedule-based computation methods whenever the van briefly stops.

**Why this priority**: This is the highest-impact user-facing quality issue. Erratic ETAs erode trust in the system and make the countdown feel broken. Affects every passenger on every route, multiple times per trip.

**Independent Test**: Can be tested by simulating a van that stops for 30-60 seconds at a traffic light (speed drops to 0, distance > 500m from stop) and verifying that the displayed ETA changes smoothly rather than jumping between methods.

**Acceptance Scenarios**:

1. **Given** a van is 800m from the next stop traveling at 5 m/s, **When** the van stops at a red light for 45 seconds, **Then** the displayed ETA does not change by more than 30% during the stop.
2. **Given** the ETA was computed using GPS data, **When** the van's speed drops below 1.0 m/s for less than 60 seconds, **Then** the system continues using GPS-based ETA with a fallback speed instead of switching to schedule-based ETA.
3. **Given** the van has been stationary for more than 60 seconds and is far from the next stop, **When** the grace period expires, **Then** the system transitions to schedule-based ETA.
---

### User Story 2 - Resilient Speed Smoothing (Priority: P1)

The system computes a stable effective speed for ETA calculations that is not thrown off by GPS noise or brief signal anomalies. Today, a single GPS spike (e.g., a false 40 m/s reading) can inflate the smoothed speed by 71%, causing the ETA to be wildly optimistic.

**Why this priority**: GPS noise is inherent to mobile devices. A single bad reading should not corrupt the ETA. This is a foundational accuracy improvement that benefits all other ETA computations.

**Independent Test**: Can be tested by providing an array of recent speeds that includes an outlier spike and verifying the smoothed speed is not significantly affected.

**Acceptance Scenarios**:

1. **Given** recent speed readings of [5, 6, 5, 40, 6, 5, 4, 6, 5, 6] m/s (one GPS spike), **When** the smoothed speed is computed, **Then** the result is within 10% of the true median speed (~5.5 m/s), not inflated by the spike.
2. **Given** recent speed readings with no outliers [5, 6, 5, 7, 6, 5, 4, 6, 5, 6], **When** the smoothed speed is computed, **Then** the result is consistent with the arithmetic mean (~5.5 m/s).
3. **Given** all recent speed readings are zero, **When** the smoothed speed is computed, **Then** the system falls back to the defined fallback speed or the current instantaneous GPS speed.

---

### User Story 3 - Accurate Congestion Factor Early in Route (Priority: P2)

When a route has just started and only 1-2 stops have been passed, the ETA congestion adjustment does not swing wildly based on a single atypical segment. Today, the system blends real-time observations into the congestion factor even with only one data point, which can be unrepresentative (e.g., a long passenger boarding stop).

**Why this priority**: Early-route ETA accuracy sets passenger expectations for the rest of the trip. A noisy congestion factor in the first 20% of the route undermines trust.

**Independent Test**: Can be tested by computing the time factor with only 1-2 recent runs and verifying it matches the historical baseline without being skewed by the small sample.

**Acceptance Scenarios**:

1. **Given** a route has only 1 passed stop segment, **When** the congestion factor is computed, **Then** the system uses only the historical time-of-day factor without blending in the single observation.
2. **Given** a route has 3 or more passed stop segments, **When** the congestion factor is computed, **Then** the system blends historical and recent observations as designed.
3. **Given** a route has 2 passed segments, **When** the congestion factor is computed, **Then** the system uses only the historical factor (minimum 3 segments required for blending).

---

### User Story 4 - Consistent Distance Computation Across Training and Runtime (Priority: P2)

The system uses the same distance computation method for both historical congestion factor training and real-time congestion factor calibration. Today, the nightly training script uses road-network distances while the real-time calibration uses straight-line distances with a fixed multiplier, creating a systematic 20-50% discrepancy in factor ratios.

**Why this priority**: Inconsistent distance methods produce misaligned congestion factors. The training data says "this segment has factor 1.25" but runtime computes "this segment has factor 1.53" for the same conditions, undermining the calibration system.

**Independent Test**: Can be tested by computing a recent-run factor for a known stop pair and comparing the predicted-minutes calculation against the training script's prediction for the same pair.

**Acceptance Scenarios**:

1. **Given** a road-network routing service is available, **When** the system computes predicted travel time for a recently-passed stop pair, **Then** it uses road-network distance (not straight-line distance with a fixed multiplier).
2. **Given** the road-network service is unavailable, **When** the system computes predicted travel time, **Then** it falls back to straight-line distance with the correction factor, matching the training script's fallback behavior.

---

### User Story 5 - Clean Codebase and Documented Constants (Priority: P3)

The ETA codebase is free of dead code, has consistent constants across all modules, and documents the rationale behind key magic numbers. Today, there is dead code from previous fixes, a speed constant mismatch between two files (8.3 vs 8.33), an undocumented fallback speed, and an unconditional debug log that fires 900-1,500 times per hour in production.

**Why this priority**: Code hygiene reduces maintenance burden and prevents future bugs. Documented constants help future developers understand design decisions without archaeological research.

**Independent Test**: Can be verified by code review -- no dead assignments, consistent constants, documented rationale for magic numbers, and no unconditional hot-path logging.

**Acceptance Scenarios**:

1. **Given** the routing service returns a result, **When** the ETA is computed, **Then** no unused variable assignments exist in the routing code path.
2. **Given** two modules reference the same conceptual constant (reference speed), **When** the code is inspected, **Then** both use the same value from a single source.
3. **Given** the fallback speed constant is defined, **When** a developer reads the code, **Then** a comment explains the rationale (urban crawling speed estimate, ~15 km/h).
4. **Given** the ETA is computed via the GPS path, **When** no debug flag is enabled, **Then** no verbose comparison log is emitted.

---

### User Story 6 - Data-Driven Time-of-Day Factors (Priority: P3)

The system's time-of-day congestion factors are derived from actual CAAB van operating data rather than educated guesses. Today, the factors are hardcoded estimates that have never been validated, and the nightly script that would generate data-driven factors has never been run. Sundays have no congestion adjustment at all (factor = 1.0).

**Why this priority**: Congestion factors directly multiply every ETA. A 0.2 error in the factor produces a 20% ETA error. Data-driven calibration is the foundation for accurate ETAs across all times of day.

**Independent Test**: Can be tested by running the calibration process against historical data and verifying it produces a factors file with reasonable values for all day types.

**Acceptance Scenarios**:

1. **Given** at least 14 days of historical route-run data exists, **When** the calibration process is run, **Then** it produces time-of-day factors for weekday, Saturday, and Sunday.
2. **Given** the calibration process has been run, **When** the ETA system starts, **Then** it loads the generated factors instead of using only hardcoded defaults.
3. **Given** Sunday has no calibrated data, **When** the system falls back to defaults, **Then** a reasonable baseline factor is used (not 1.0/no correction).

---

### User Story 7 - Direction-Aware Haversine Fallback (Priority: P3)

When the road-network routing service is unavailable and the system uses straight-line distance estimation, it detects when the van is moving away from the next stop and adjusts accordingly. Today, a van heading in the opposite direction still gets an optimistic ETA based on the shrinking straight-line distance to the stop.

**Why this priority**: Lower priority because the road-network routing service naturally handles direction through the road graph. This only matters in the fallback path when routing is unavailable.

**Independent Test**: Can be tested by providing a sequence of GPS positions that move away from the target stop and verifying the system applies a penalty or falls back to schedule.

**Acceptance Scenarios**:

1. **Given** the routing service is unavailable and the van's recent trajectory shows it moving away from the next stop (bearing difference > 90 degrees), **When** the ETA is computed via straight-line fallback, **Then** the system falls back to schedule-based ETA instead of using the unreliable haversine distance.
2. **Given** the routing service is available, **When** the van is moving away from the stop, **Then** the routing service's duration naturally accounts for the detour and no additional penalty is needed.

---

### Edge Cases

- What happens when the van is exactly at the 500m proximity boundary and speed fluctuates around 1.0 m/s? The hysteresis mechanism prevents rapid flipping by maintaining GPS-based ETA during the grace period.
- What happens when the routing service returns 0-second duration? The system treats this as a failure and falls back to haversine.
- What happens when all 10 recent speed readings are identical? Median and mean produce the same result -- no issue.
- What happens when the grace period expires mid-API-call? The system checks conditions at computation time; no race condition exists.
- What happens when the calibration script runs but no historical data exists? It produces no file and the system continues using defaults.
- What happens when a van's heading data is unavailable (null)? The direction check is skipped and the system behaves as it does today.
- What happens when the routing service becomes unavailable after being available? The system falls back to haversine for that specific call; the next call retries routing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement a grace period (hysteresis) that keeps using GPS-based ETA when the van's current speed is below the movement threshold but at least one recent ping (within the last 60 seconds) had speed >= 1.0 m/s. During the grace period, the fallback speed is used for travel time estimation. No new persistent state is required -- the system infers the grace condition from existing recent pings.
- **FR-002**: System MUST continue to expose the ETA computation source (GPS-based or schedule-based) in the API response. No UI indicator is displayed to passengers -- the hysteresis mechanism (FR-001) is the primary solution to smooth transitions.
- **FR-003**: System MUST use median (not arithmetic mean) when computing the smoothed speed from recent GPS readings, to be resilient against outlier spikes.
- **FR-004**: System MUST require a minimum of 3 recent-run segments before blending real-time observations into the congestion factor. With fewer than 3 segments, only the historical time-of-day factor is used.
- **FR-005**: System MUST use road-network distances (when routing service is available) for real-time congestion factor calibration, falling back to straight-line distance with correction factor when unavailable. Road-network distances for fixed stop pairs MUST be pre-computed and cached (since stop locations do not change), adding zero latency to the route API hot path. This aligns runtime behavior with the training script.
- **FR-006**: System MUST remove the dead variable assignment in the routing service code path where distance is assigned but never consumed.
- **FR-007**: System MUST unify the reference speed constant to a single value (8.3 m/s) shared between runtime and the training script.
- **FR-008**: System MUST document the fallback speed constant with a comment explaining its rationale (urban crawling speed, ~15 km/h).
- **FR-009**: System MUST gate the verbose ETA comparison log behind an environment variable so it does not fire unconditionally on every computation in production.
- **FR-010**: System MUST add a baseline Sunday congestion factor (default values for Sunday hours) rather than using no correction (1.0) for all Sunday hours.
- **FR-011**: System MUST provide a runnable calibration process that generates data-driven time-of-day factors from historical route-run data, with documentation on how and when to run it.
- **FR-012**: System MUST detect when a van is moving away from the next stop (bearing difference > 90 degrees from recent trajectory) in the haversine fallback path and fall back to schedule-based ETA. The haversine distance is unreliable when the van is heading in the wrong direction, so schedule delay from the last passed stop is used instead. This check is skipped when heading data is unavailable or when the routing service provides the duration.

### Key Entities

- **ETA Computation**: The core calculation that produces estimated arrival time, delay, and source indicator for the next pending stop.
- **Congestion Factor (timeFactor)**: A multiplier blending historical time-of-day patterns with real-time observations from today's passed stops.
- **Recent Run**: A pair of consecutive passed stops with actual travel time and predicted travel time, used to compute the real-time congestion signal.
- **Speed Estimate**: The effective speed used for distance-based ETA, derived from recent GPS readings via median smoothing.
- **ETA Source**: An indicator of which method produced the current ETA -- GPS with routing, GPS with straight-line estimation, or schedule-based.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: During a typical 30-second traffic light stop, the displayed ETA changes by no more than 30% relative to the GPS-based ETA shown immediately before the van stopped (eliminates the current 40-50% jumps caused by switching to schedule-based ETA).
- **SC-002**: A single GPS speed outlier (10x the normal speed) causes less than 10% deviation in the smoothed speed estimate relative to the true median of the sample (down from the current 71% error with arithmetic mean).
- **SC-003**: The congestion factor (timeFactor) value during the first 3 stops of a route is within 5% of the historical time-of-day factor, because no real-time blending occurs until 3 segments are available (eliminates noisy blending from 1-2 data points).
- **SC-004**: The real-time congestion factor predicted-minutes ratio (actualMinutes / predictedMinutes) for a given stop pair matches the training script's ratio within 5% when both use the same distance source — i.e., OSRM road distance or haversine with identical correction factor (down from the current 22% discrepancy caused by distance method mismatch).
- **SC-005**: Production ETA computation logs are reduced to zero per hour by default (down from 900-1,500/hour), with opt-in verbose logging available.
- **SC-006**: All ETA-related constants are defined in a single location per concept, with no duplicate or mismatched values across modules.
- **SC-007**: Every magic-number constant in the ETA pipeline has an inline comment explaining its value and rationale.

## Assumptions

- The 60-second grace period is appropriate for typical Salvador urban traffic patterns (traffic lights last 30-60 seconds, passenger boarding lasts 30-120 seconds). This can be tuned via a constant if needed.
- Requiring N >= 3 segments for blending is the right threshold -- it covers the statistically weak early-route period (first 21% of a 15-stop route) without delaying real-time calibration unnecessarily.
- Median is preferred over EMA (exponential moving average) for speed smoothing because outlier immunity is more valuable than recency weighting for this use case (GPS spikes are the primary concern, not acceleration detection).
- The direction detection penalty in the haversine fallback path is a best-effort improvement. It does not need to be perfect -- the routing service handles direction correctly when available, and this is only for the fallback path.
- Sunday baseline factors will use a conservative 0.95-1.0 range (lighter traffic than weekdays) until data-driven calibration provides actual values.
- The ETA source is kept in the API response for debugging and future use, but no UI indicator is shown to passengers. The hysteresis mechanism is sufficient to smooth transitions.
- The schedule-delay fallback continues to use the last-passed-stop delay (not weighted average). This is a deliberate simplicity trade-off: the current approach is reactive and correct for recovery scenarios, and the schedule fallback is only used ~15-20% of the time.

## Scope Boundaries

### In Scope

- All 11 identified ETA gaps (dead code, hysteresis, speed smoothing, factor blending, distance consistency, direction detection, schedule delay documentation, logging, constant alignment, constant documentation, calibration)
- Changes to ETA computation logic, time-factor computation, training script, and API responses
- Test coverage for all new behaviors

### Out of Scope

- Multi-stop ETA (computing ETA for stops beyond the immediate next one)
- Dwell time modeling at intermediate stops
- ML-based ETA prediction
- Client-side countdown timer (smooth local decrement between server polls)
- Changes to GPS ping ingestion or geofence detection logic
- Weighted-average schedule delay (current last-stop-delay approach is kept; trade-off is documented)

## Dependencies

- The road-network routing service must be available for FR-005 (road-network distance in runtime calibration). The feature degrades gracefully with haversine fallback when the service is unavailable.
- Historical route-run data (at least 14 days) must exist in the database for FR-011 (calibration script) to produce meaningful factors.
- The heading field must already be populated in van location pings for FR-012 (direction detection). If heading data is not being sent by the tracker app, this feature silently degrades.
