# Feature Specification: Tracking Inference Fixes

**Feature Branch**: `051-tracking-inference-fixes`
**Created**: 2026-03-07
**Status**: Draft
**Input**: Improve tracking system reliability by decoupling route lifecycle from GPS freshness, adding confidence-gated stop backfill, logical stop grouping, hybrid raw/snapped position policy, segment-aware ETA fallback, and persisted progress state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route Stays Active Despite Stale GPS (Priority: P1)

A passenger checks the app for their van's status. The driver is actively driving but the tracker temporarily lost GPS signal. Today, the app shows "not running" because `isRunning` requires fresh GPS. With this fix, the app correctly shows the route as "in progress" with a visual indicator that location data is momentarily stale, rather than falsely showing the route as inactive.

**Why this priority**: This is the most user-visible bug. Passengers see routes disappear and reappear unpredictably, eroding trust in the system. Fixing this has the highest impact on perceived reliability.

**Independent Test**: Can be fully tested by simulating a stale GPS scenario (GPS fix older than 10 minutes) while the driver has an active shift. The route should still show as running with a "stale location" indicator instead of disappearing.

**Acceptance Scenarios**:

1. **Given** a driver has an active shift and last GPS fix is 15 minutes old, **When** a passenger views the route, **Then** the route shows as "in progress" with a stale tracking indicator.
2. **Given** a driver has an active shift and last GPS fix is 3 minutes old, **When** a passenger views the route, **Then** the route shows as "in progress" with a live tracking indicator.
3. **Given** no shift exists for today, **When** a passenger views the route regardless of GPS age, **Then** the route shows as "waiting" (not started).
4. **Given** a driver's shift has ended, **When** a passenger views the route, **Then** the route shows as "completed" regardless of GPS freshness.

---

### User Story 2 - Accurate Stop Progress Without False Backfill (Priority: P1)

An admin monitors route progress. A van briefly enters the geofence of stop #5 due to GPS drift, but the van is actually near stop #2. Today, the system marks stops #1-#5 all as "passed" unconditionally. With this fix, the system requires higher confidence before backfilling skipped stops and records the inference source, reducing false positives while still supporting legitimate mid-route starts.

**Why this priority**: False backfill is the highest-value correctness fix. It directly misleads passengers about which stops have been served and corrupts operational data.

**Independent Test**: Can be tested by sending a single GPS ping within stop #5's geofence while stop #2 is the expected next stop. Stops #1-#4 should NOT be marked as passed unless confidence criteria are met (e.g., 2 consecutive pings, or stop is significantly overdue).

**Acceptance Scenarios**:

1. **Given** a van sends 2 consecutive pings within stop #5's geofence and stop #5's scheduled time has passed, **When** stop progress is inferred, **Then** stops #1-#4 are backfilled as "passed" with source marked as "backfill" and lower confidence.
2. **Given** a van sends only 1 ping within stop #5's geofence, **When** stop progress is inferred, **Then** stops #1-#4 are NOT backfilled (single ping is insufficient for a multi-stop jump).
3. **Given** a van sends 1 ping within stop #3's geofence (only 1 stop ahead of current), **When** stop progress is inferred, **Then** stop #2 is backfilled (small jump is acceptable with single ping).
4. **Given** a stop is marked as passed via backfill, **When** an admin reviews the data, **Then** the backfilled stops are distinguishable from geofence-confirmed stops via metadata (pass source and confidence).

---

### User Story 3 - Repeated Stops Identified by Logical Group (Priority: P2)

A route visits the same physical location twice (e.g., a school at pickup and drop-off times). Today, repeated stops are grouped by exact floating-point coordinate equality, which can fail if coordinates differ by tiny amounts across schedule entries. With this fix, stops are grouped by a logical identifier, making repeated-stop handling reliable regardless of minor coordinate variations.

**Why this priority**: Repeated stops exist in real routes. Misidentification causes the wrong occurrence to be marked as passed, cascading into incorrect next-stop and ETA calculations.

**Independent Test**: Can be tested by creating two schedule entries for the same physical stop with slightly different coordinates but the same logical group identifier. The system should treat them as the same physical location.

**Acceptance Scenarios**:

1. **Given** two schedule entries share the same logical stop group identifier but have coordinates differing by 0.00001 degrees, **When** geofence matching runs, **Then** they are treated as the same physical location for occurrence selection.
2. **Given** two schedule entries have identical coordinates but no logical group identifier, **When** geofence matching runs, **Then** the system falls back to coordinate-based grouping (backward compatible).
3. **Given** an admin creates a schedule entry, **When** they assign a stop group identifier, **Then** the identifier is stored and used in inference.

---

### User Story 4 - Persisted Progress State Eliminates API Recomputation (Priority: P2)

The ingestion pipeline now persists progress pointers (last passed stop, next stop) directly on the route run during inference. The API continues to compute fresh values from `route_run_stops` on each request (Phase 1 — write-only). The persisted pointers serve as a debugging aid and single source of truth for what the inference decided, enabling a future Phase 2 cutover where the API reads them directly.

**Why this priority**: This is a foundational improvement that simplifies the API, improves debuggability, and ensures a single source of truth for progress state. It supports all other inference improvements.

**Independent Test**: Can be tested by running stop inference, then querying the route run record directly to verify that `last_passed_stop_id` and `next_stop_id` are persisted and match what the API returns.

**Acceptance Scenarios**:

1. **Given** a stop is marked as passed during ingestion, **When** the inference completes, **Then** last passed stop and next stop pointers are updated on the route run record.
2. **Given** the API receives a route request, **When** assembling progress data, **Then** persisted pointers on the route run match the freshly computed values (Phase 1 — write-only, API still computes fresh).
3. **Given** no stops have been passed yet, **When** the API reads the route run, **Then** last passed stop is empty and next stop points to the first scheduled stop.

---

### User Story 5 - Segment-Aware ETA Fallback (Priority: P3)

When GPS-based ETA is unavailable (stale location, van stopped), the system falls back to a uniform schedule delay. This treats all segments as equal duration, producing inaccurate ETAs for routes with segments of varying length. With this fix, a new intermediate fallback uses stored road distances and historical time factors to estimate per-segment duration, providing better ETA accuracy even without live GPS.

**Why this priority**: Improves ETA quality using data already in the system. Lower priority because the current schedule fallback is functional, just less accurate.

**Independent Test**: Can be tested by simulating a stale GPS scenario where the last passed stop and next stop have known road distances. The ETA should reflect segment-specific duration rather than uniform schedule delay.

**Acceptance Scenarios**:

1. **Given** GPS ETA is unavailable and road segment distance is known between last passed and next stop, **When** ETA is computed, **Then** the system uses segment-aware estimation (distance + historical factor) instead of uniform schedule delay.
2. **Given** GPS ETA is unavailable and no road segment distance exists, **When** ETA is computed, **Then** the system falls back to uniform schedule delay (existing behavior preserved).
3. **Given** GPS ETA becomes available again, **When** ETA is computed, **Then** GPS-based ETA takes priority over segment-aware fallback.

---

### User Story 6 - Admin Tracker Health Visibility (Priority: P3)

An admin wants to monitor tracker health across the fleet to proactively identify connectivity issues. Today, tracker health data exists internally but is not exposed to admin screens. With this fix, admin van endpoints include tracker health metrics (last GPS fix, staleness, buffer size, failure count, unhealthy flag).

**Why this priority**: Operational visibility for admins. Lower priority because it doesn't affect passenger-facing accuracy, but valuable for proactive fleet management.

**Independent Test**: Can be tested by querying the admin van endpoint and verifying that tracker health fields are present in the response.

**Acceptance Scenarios**:

1. **Given** a van has a GPS fix from 15 minutes ago with high buffer size and failure count, **When** an admin queries the van endpoint, **Then** the response includes staleness minutes, buffer size, failure count, and an unhealthy indicator.
2. **Given** a van has a fresh GPS fix with no issues, **When** an admin queries the van endpoint, **Then** the response includes a healthy indicator.

---

### Edge Cases

- What happens when a van has no GPS fix at all (never reported)? The route should show as "waiting" or "in progress" with "missing" tracking status, never crash.
- What happens when all stops have been passed but the shift is still active? The system should show the run as "in progress" with no next stop, not reset or re-trigger inference.
- What happens when the schedule has only one stop? Backfill logic should handle the degenerate case gracefully (nothing to backfill).
- What happens when road distances are partially available (some segments have data, others don't)? The segment-aware fallback should use available data for covered segments and fall back to schedule delay for gaps.
- What happens when a stop group identifier is changed after some runs have already been recorded? Existing run stop records should not be affected; only future inference uses the updated grouping.
- What happens when the system clock drifts (e.g., NTP issue)? The early-arrival window and time-based filtering should still produce reasonable results within a small margin.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST derive route operational state (waiting, in progress, idle, completed) from shift lifecycle only, independent of GPS freshness.
- **FR-002**: System MUST provide a separate tracking quality indicator alongside route operational state: "live" when last GPS fix is under 10 minutes old, "stale" when between 10 and 60 minutes old, and "missing" when over 60 minutes old or no fix has ever been received.
- **FR-003**: System MUST maintain backward compatibility by keeping the existing running indicator as a derived field during a transition period, computed from route state only (not GPS freshness).
- **FR-004**: System MUST require high-confidence evidence before backfilling skipped stops as passed (at minimum: 2 pings within a 5-minute window inside the geofence, OR both raw and snapped positions agree, OR stop is significantly overdue and multiple stops ahead).
- **FR-005**: System MUST record pass source (geofence direct, backfill, or manual) and confidence level for each stop passage event.
- **FR-005a**: System MUST use raw GPS position for geofence stop matching when the snap displacement (distance between raw and snapped coordinates) exceeds 50 meters, and prefer the snapped position otherwise.
- **FR-006**: System MUST support a logical stop group identifier on schedule entries for repeated-stop grouping, falling back to coordinate-based grouping when the identifier is absent.
- **FR-007**: System MUST persist last passed stop, next stop, and progress update timestamp on the route run during ingestion.
- **FR-008**: System MUST persist progress pointers during ingestion. The API currently computes fresh values from stop records (Phase 1 — write-only). A future Phase 2 may switch the API to read persisted pointers as the primary source.
- **FR-009**: System MUST implement a segment-aware ETA fallback tier between GPS-based ETA and uniform schedule delay, using stored road distances and historical time factors.
- **FR-010**: System MUST preserve the existing schedule delay fallback as the final safety net when no GPS, no stop coordinates, no passed stops, and no segment distance data are available.
- **FR-011**: System MUST expose tracker health metrics (last GPS fix, staleness, buffer size, failure count, unhealthy flag) through admin van endpoints.
- **FR-012**: System MUST NOT change existing stop status values (pending/passed) — confidence metadata is additive, not a replacement.

### Key Entities

- **Route Run**: Daily instance of a route. Extended with progress pointers (last passed stop, next stop, progress update timestamp).
- **Route Run Stop**: Individual stop progress within a run. Extended with pass source and confidence metadata.
- **Schedule Entry**: Fixed daily schedule definition. Extended with optional logical stop group identifier.
- **Tracking Status**: New concept representing GPS telemetry quality (live / stale / missing), decoupled from route lifecycle.
- **Tracker Health**: Aggregated device health metrics for admin monitoring (staleness, buffer size, failure count, battery, network type).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Routes with active shifts never disappear from the "running" view due to stale GPS — false negatives for active routes reduced to zero.
- **SC-002**: Stop backfill false positives (stops marked passed when the van did not actually pass them) are reduced by at least 80% compared to current unconditional backfill.
- **SC-003**: Repeated stops at the same physical location are correctly identified and matched 100% of the time when a logical group identifier is assigned.
- **SC-004**: ETA accuracy improves for non-GPS scenarios — segment-aware fallback produces ETAs within 30% of actual arrival time for segments with known road distances.
- **SC-005**: Admin users can identify unhealthy trackers within 30 seconds of viewing the fleet dashboard.
- **SC-006**: All existing tracking test cases continue to pass (zero regressions), and new test cases cover each changed behavior.
- **SC-007**: Persisted progress pointers match freshly computed values — ingestion writes correct `last_passed_stop_id` and `next_stop_id` on each inference run.

## Clarifications

### Session 2026-03-07

- Q: What defines "consecutive pings" for backfill confidence gating? → A: Two pings within a 5-minute window inside the geofence (time-bounded, not just sequential).
- Q: What thresholds define tracking status (live/stale/missing)? → A: Live < 10 min, Stale >= 10 and < 60 min, Missing >= 60 min or no fix ever.
- Q: Should hybrid raw/snapped position policy be an explicit requirement with a defined threshold? → A: Yes — prefer raw GPS for stop passage when snap displacement exceeds 50m; prefer snapped otherwise.
