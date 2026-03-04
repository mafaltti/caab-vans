# Feature Specification: OSRM Route-Based ETA

**Feature Branch**: `037-osrm-eta-baseline`
**Created**: 2026-03-04
**Status**: Draft
**Input**: Replace the current haversine-based ETA calculation with OSRM road distance and time-of-day correction factors for significantly more accurate arrival time predictions. Ships all three layers as code — accuracy auto-improves as operational data accumulates, with no waiting period required for new deployments.

## Clarifications

### Session 2026-03-04

- Q: How often does the background refinement process run? → A: Nightly (once per day, after the last route ends).
- Q: Should the time-of-day correction factor apply to haversine fallback ETAs too, or only road-distance-based? → A: Apply to both — rush hour affects travel time regardless of how distance was measured.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - More Accurate ETAs Using Road Distance (Priority: P1)

A parent or passenger checking the CAAB Vans dashboard sees an estimated arrival time for their van. Currently, the ETA uses straight-line distance with a fixed 1.3 multiplier, which produces large errors on winding roads, one-way streets, and hillside neighborhoods. With this feature, the system uses actual road distance from a routing engine, producing ETAs that are significantly closer to reality.

**Why this priority**: This is the core value — replacing the inaccurate distance source that causes the biggest ETA errors (up to 100% on routes with detours/winding roads). It directly improves the primary metric users care about: "when will the van arrive?"

**Independent Test**: Can be tested by comparing ETAs shown on the dashboard against actual van arrival times on various route types (straight avenues vs. winding hillside roads).

**Acceptance Scenarios**:

1. **Given** a van is actively moving on a route with GPS speed above the minimum threshold, **When** the system calculates ETA for the next stop, **Then** the ETA uses road distance obtained from the routing engine rather than straight-line distance with a fixed multiplier.
2. **Given** a van is traveling a winding hillside route where the road distance is 2x the straight-line distance, **When** the ETA is calculated, **Then** the ETA reflects the actual road distance, not the underestimated straight-line approximation.
3. **Given** a route with a mandatory one-way detour, **When** the ETA is calculated, **Then** the road distance accounts for the actual driving path including the detour.

---

### User Story 2 - Graceful Fallback When Road Distance Is Unavailable (Priority: P1)

When the road distance service is temporarily unavailable (timeout, network issue, or misconfiguration), the system seamlessly falls back to the existing haversine-based calculation so that users always see an ETA — never a blank or error state.

**Why this priority**: Equal to P1 because reliability is non-negotiable. A more accurate system that sometimes shows no ETA is worse than a less accurate system that always works.

**Independent Test**: Can be tested by disabling the routing engine and verifying the dashboard still shows ETAs using the previous calculation method.

**Acceptance Scenarios**:

1. **Given** the routing engine is unreachable, **When** the system calculates ETA, **Then** it falls back to the straight-line distance calculation with time-of-day correction still applied, and shows an ETA to the user.
2. **Given** the routing engine takes longer than the configured timeout, **When** the system calculates ETA, **Then** the request is abandoned and the fallback method is used without delaying the overall response.
3. **Given** the routing engine is not configured (no base URL), **When** the system calculates ETA, **Then** it behaves identically to the current system with no errors or warnings visible to users.

---

### User Story 3 - Rush Hour ETA Correction (Priority: P1)

During morning and evening rush hours, a van's current GPS speed may not reflect conditions on the road ahead. The system applies a time-of-day correction factor to the ETA, accounting for predictable congestion patterns. On day one, these factors are seeded with reasonable city defaults. Over time, a background process refines them automatically from actual trip data — no manual tuning required.

**Why this priority**: Without time-of-day correction, ETAs systematically underpredict during rush hour (the van is momentarily fast, but the road ahead is slow). This is the most common user complaint scenario — "the app said 5 minutes but it took 12."

**Independent Test**: Can be tested by comparing ETAs generated at 8 AM vs. 11 AM for the same van position and speed. The rush-hour ETA should be noticeably higher due to the correction factor.

**Acceptance Scenarios**:

1. **Given** a van is moving during a known rush hour period, **When** the ETA is calculated, **Then** the ETA is adjusted upward by a time-of-day correction factor reflecting typical congestion at that hour.
2. **Given** a van is moving during an off-peak period, **When** the ETA is calculated, **Then** the correction factor is near 1.0 (minimal or no adjustment).
3. **Given** no historical trip data exists yet (new deployment), **When** the ETA is calculated during rush hour, **Then** the system uses seeded default factors based on typical urban rush hour patterns.
4. **Given** the system has accumulated at least one month of trip data, **When** correction factors are recomputed, **Then** the factors reflect actual observed differences between predicted and real travel times for each time-of-day bucket.

---

### User Story 4 - Today's Conditions Override Historical Averages (Priority: P2)

When today's earlier trips on the same route were significantly slower or faster than the historical average (due to rain, events, construction), the system blends recent observations into the correction factor so that ETAs for later trips reflect today's reality, not just the long-term average.

**Why this priority**: Captures day-specific anomalies that historical averages miss. Important for accuracy but depends on having earlier trips completed the same day — so it only kicks in for later runs.

**Independent Test**: Can be tested by simulating a day where morning runs were 30% slower than predicted, then verifying that afternoon ETAs use a higher correction factor than the historical default.

**Acceptance Scenarios**:

1. **Given** today's earlier completed trips on a route were 30% slower than predicted, **When** the system calculates ETA for a later trip on the same route, **Then** the correction factor is blended upward to reflect today's slower conditions.
2. **Given** no trips have completed today yet (first run of the day), **When** the ETA is calculated, **Then** only the historical average factor is used (no recency blend).
3. **Given** today's earlier trips were faster than the historical average, **When** the ETA is calculated for a later trip, **Then** the correction factor is blended downward.

---

### User Story 5 - ETA Source Transparency (Priority: P2)

The system tracks which calculation method produced each ETA (road distance, straight-line fallback, or schedule-based). This enables operators and developers to monitor accuracy, measure improvement, and identify fallback frequency.

**Why this priority**: Important for validating the feature's impact and diagnosing issues, but not directly visible to end users.

**Independent Test**: Can be tested by querying the route data and verifying each ETA includes a source indicator showing which method was used.

**Acceptance Scenarios**:

1. **Given** an ETA was calculated using road distance, **When** the route data is returned, **Then** the ETA source is identified distinctly from the haversine fallback.
2. **Given** an ETA was calculated using the haversine fallback, **When** the route data is returned, **Then** the ETA source indicates the fallback method was used.
3. **Given** the system uses schedule-based ETA (van stopped or no GPS), **When** the route data is returned, **Then** the ETA source indicates the schedule method.

---

### User Story 6 - Comparison Logging for Accuracy Measurement (Priority: P3)

During the rollout period, the system logs both the old (haversine) and new (road distance) ETA calculations side by side for each request. This allows comparing accuracy between methods and building confidence in the new approach.

**Why this priority**: Valuable for validating improvement and feeding the correction factor refinement process, but does not affect user-facing behavior.

**Independent Test**: Can be tested by triggering ETA calculations and verifying structured log entries contain both calculation methods' outputs.

**Acceptance Scenarios**:

1. **Given** a van is moving and the routing engine is available, **When** an ETA is calculated, **Then** a structured log entry is produced containing both the old haversine-based distance/ETA and the new road-distance-based ETA.
2. **Given** comparison logging is active, **When** logs are reviewed, **Then** each entry includes the route, stop, GPS speed, both distances, both ETAs, the correction factor applied, and which method was chosen.

---

### User Story 7 - Automatic Factor Refinement from Trip Data (Priority: P3)

A nightly background process analyzes completed trip data — comparing what the system predicted vs. what actually happened — and updates the time-of-day correction factors. Over time, this makes ETAs progressively more accurate without any manual intervention.

**Why this priority**: This is the "self-improving" layer. High long-term value, but the system works from day one with seeded defaults. The refinement process is additive — it improves accuracy but is not required for the feature to function.

**Independent Test**: Can be tested by running the background process against a set of completed trips and verifying it produces updated correction factors that differ from the initial defaults.

**Acceptance Scenarios**:

1. **Given** at least two weeks of completed trip data exist, **When** the background refinement process runs, **Then** it produces updated correction factors grouped by day type (weekday/saturday/sunday) and hour bucket.
2. **Given** the refinement process produces new factors, **When** the next ETA calculation occurs, **Then** it uses the updated factors instead of the initial defaults.
3. **Given** different routes show meaningfully different congestion patterns (variance > 15% for the same time bucket), **When** the refinement process runs, **Then** it produces per-route factor overrides in addition to the global factors.

---

### Edge Cases

- What happens when the van is very close to the next stop (under 100 meters)? The road distance should still be used, but the ETA difference between methods becomes negligible.
- What happens when the routing engine returns a road distance shorter than the straight-line distance (valid for one-way routing)? The system should use the routing engine result as-is.
- What happens when the van's GPS speed drops below the minimum threshold mid-route? The system falls back to schedule-based ETA regardless of whether road distance is available, since speed is unreliable.
- What happens when processing multiple routes simultaneously? Road distance lookups for different routes must not block each other.
- What happens when the van is off the known road network (parking lot, private road)? The routing engine may return no route; the system falls back to haversine.
- What happens when the correction factor data file is missing or corrupted? The system uses the seeded default factors (factor = 1.0 for off-peak, higher for rush hours).
- What happens when there are very few data points for a specific time bucket (e.g., only 2 Saturday 7 AM observations)? The refinement process should require a minimum number of observations before overriding the default factor for that bucket.
- What happens on holidays or unusual days? The recency blending (today's observations) helps, but the historical bucket (weekday/saturday/sunday) may not capture holidays. The system treats holidays as their calendar day type — acceptable for the current scale.

## Requirements *(mandatory)*

### Functional Requirements

**Road Distance (Layer 1 — Distance)**

- **FR-001**: System MUST obtain road distance between the van's current position and the next stop using a routing engine, replacing the fixed straight-line multiplier.
- **FR-002**: System MUST calculate ETA as road distance divided by the van's current GPS speed when GPS speed is above the minimum threshold.
- **FR-003**: System MUST fall back to the existing haversine-based ETA calculation when the routing engine is unavailable, times out, or returns no valid route.
- **FR-004**: System MUST enforce a short timeout on routing engine requests to prevent delaying the overall API response.
- **FR-005**: System MUST work identically to the current system when no routing engine base URL is configured (zero-config backward compatibility).

**Time-of-Day Correction (Layer 2 — Traffic Pattern)**

- **FR-006**: System MUST apply a time-of-day correction factor to all GPS-speed-based ETAs (both road-distance and haversine fallback), multiplying the base ETA by a factor that varies by hour and day type (weekday, saturday, sunday).
- **FR-007**: System MUST ship with seeded default correction factors based on typical urban rush hour patterns, so that new deployments produce reasonable ETAs from day one.
- **FR-008**: System MUST blend the historical correction factor with a recency factor derived from today's completed trips on the same route, when such data is available.
- **FR-009**: System MUST use 100% historical factor when no trips have completed today (first run of the day).
- **FR-010**: System MUST support per-route factor overrides in addition to global factors, to accommodate routes with meaningfully different congestion patterns.

**Automatic Refinement (Layer 3 — Self-Improvement)**

- **FR-011**: A nightly background process MUST compare predicted ETAs against actual stop-to-stop travel times from completed trips, and produce updated correction factors.
- **FR-012**: The refinement process MUST require a minimum number of observations per time bucket before overriding the seeded default factor.
- **FR-013**: The refinement process MUST produce per-route overrides when variance between routes exceeds 15% for the same time bucket.
- **FR-014**: Updated correction factors MUST be usable by the ETA calculation without requiring a service restart.

**Observability**

- **FR-015**: System MUST expose the ETA calculation source (road-distance-based, haversine-fallback, or schedule-based) in the route progress data.
- **FR-016**: System MUST log structured comparison data showing both old and new calculation methods, including the correction factor applied, when the routing engine is available.

**Reliability**

- **FR-017**: System MUST handle multiple concurrent route ETA calculations without blocking (parallel requests to the routing engine).
- **FR-018**: System MUST preserve the existing fallback chain: GPS-based ETA (road or haversine) falls back to schedule-based ETA when GPS data is unavailable, stale, or the van is stopped.
- **FR-019**: System MUST gracefully handle missing or corrupted correction factor data by falling back to seeded defaults.

### Key Entities

- **Road Distance Result**: The driving distance (in meters) and estimated duration (in seconds) between two geographic coordinates, as returned by a routing engine. Only the distance is used for ETA; duration is logged for comparison.
- **ETA Source**: An indicator of which calculation method produced the current ETA — distinguishes between road-distance-based, haversine-fallback, and schedule-based methods.
- **Time-of-Day Correction Factor**: A multiplier applied to the base ETA, varying by day type (weekday/saturday/sunday) and hour bucket. A factor of 1.0 means no correction; >1.0 means the base ETA underpredicts (rush hour); <1.0 means the base ETA overpredicts (off-peak free flow).
- **Recency Factor**: A correction derived from today's completed trips on the same route, capturing day-specific conditions (rain, events, unusual congestion) that historical averages miss.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Median ETA prediction error improves from approximately 30% to 15% or better within the first week (road distance alone), as measured by comparing predicted ETAs against actual stop arrival times.
- **SC-002**: Rush-hour ETA prediction error is under 10% after correction factors are applied with seeded defaults, measured during morning (7-9 AM) and evening (5-7 PM) peaks.
- **SC-003**: After one month of data accumulation and factor refinement, overall median ETA error drops to 8% or better across all time periods.
- **SC-004**: The overall route data response time increases by no more than 25 milliseconds at the 95th percentile when road distance lookup is active.
- **SC-005**: Road distance lookup is successfully used (not falling back to haversine) for at least 95% of ETA calculations when the routing engine is configured and healthy.
- **SC-006**: Zero user-visible errors or blank ETAs are introduced — every request that previously returned an ETA continues to return an ETA.

## Assumptions

- The routing engine instance is already deployed and accessible from the application server (infrastructure exists from the road-snapping feature).
- The routing engine uses OpenStreetMap data covering the Salvador/Bahia region where CAAB vans operate.
- GPS speed reported by van tracking devices is reasonably accurate at speeds above the minimum threshold (1 m/s).
- The existing minimum speed threshold and schedule-based fallback logic remain unchanged.
- Road distance is only needed for the van's current position to the next upcoming stop, not for all remaining stops on the route.
- The background refinement process can access completed trip data (route_run_stops with passed_at timestamps) from the database.
- Seeded default correction factors for typical urban rush hours are a reasonable starting point for any Brazilian city deployment.

## Out of Scope

- Custom routing engine speed profiles per city (Lua profile tuning) — this is an infrastructure configuration concern, not an application feature. Can be done independently as a DevOps task.
- In-memory caching of road distance results (optimization to add later only if latency becomes measurable).
- Changes to the mobile/passenger-facing UI — ETAs are already displayed; this feature improves their accuracy.
- Alternative routing engine migration or external traffic providers — only if this approach proves insufficient.
- Holiday-specific correction factor buckets — the recency blending mechanism provides adequate coverage for unusual days at current scale.
