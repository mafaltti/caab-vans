# Feature Specification: Tracking Simplification

**Feature Branch**: `065-tracking-simplification`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Simplify the tracking system so that device geofence events and explicit manual confirmation are the only writers of stop progress. GPS pings remain for live position, ETA inputs, health, buffering, and offline recovery, but they no longer mutate stop status or route progress pointers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Device Geofence Drives Stop Progression (Priority: P1)

When a van arrives at a scheduled stop, the device-side geofence event is the sole automatic mechanism that marks the stop as passed and updates the route's progress pointers. The system advances stops one at a time in route order, never skipping ahead.

**Why this priority**: This is the core behavioral change. Without it, two competing engines (GPS inference and device geofence) write conflicting stop status, causing false advancement and inconsistent progress.

**Independent Test**: Can be tested by sending a device geofence event for the first pending stop and verifying that `route_run_stops` is marked passed, `route_runs` pointers are updated, and the device receives a selective acknowledgement.

**Acceptance Scenarios**:

1. **Given** an active route run with stops A, B, C all pending, **When** the device sends a geofence enter event for stop A, **Then** stop A is marked passed with `pass_source = "device_geofence"`, `last_passed_stop_id` points to A, and `next_stop_id` points to B.
2. **Given** an active route run with stop A passed and stops B, C pending, **When** the device sends a geofence enter event for stop C (skipping B), **Then** stop C is NOT marked passed; the event is deferred and remains retryable on subsequent requests.
3. **Given** a deferred geofence event for stop C and stop B is later passed (by geofence or manual confirm), **When** stop C's event is resubmitted on the next ping, **Then** stop C is now head-of-line and is marked passed.

---

### User Story 2 - GPS Pings No Longer Change Stop Status (Priority: P1)

GPS location pings continue to be stored, used for live map position, road snapping, ETA computation, and health monitoring. However, a GPS ping alone never marks a stop as passed or updates progress pointers on the route run.

**Why this priority**: Removing GPS-based stop inference eliminates the root cause of false advancement, conflicting pass sources, and backfill heuristics that create incorrect route progress.

**Independent Test**: Can be tested by sending a GPS ping near a scheduled stop and verifying that `route_run_stops` and `route_runs` pointers remain unchanged, while `van_location_pings` and van position are updated.

**Acceptance Scenarios**:

1. **Given** an active route run with all stops pending, **When** a GPS ping arrives within the geofence radius of the first stop, **Then** the ping is stored in `van_location_pings`, van position is updated, but no `route_run_stops` rows change status and no `route_runs` pointers change.
2. **Given** an active route run, **When** a batch of GPS pings arrives covering multiple stop locations, **Then** all pings are stored and position is updated to the newest, but no stop status or progress pointers change.

---

### User Story 3 - Manual Confirmation as Missed-Geofence Fallback (Priority: P1)

When automatic geofence detection fails (device issues, GPS drift, battery optimization), the driver can manually confirm a stop. Manual confirmation marks the confirmed stop and all prior pending stops as passed, updates progress pointers, and unblocks any deferred geofence events for subsequent stops.

**Why this priority**: Manual confirm is the official recovery path when device geofencing is unavailable. Without it, routes would stall at missed stops with no way to advance.

**Independent Test**: Can be tested by manually confirming stop C when stops A and B are still pending, verifying A, B, C are all marked passed with `pass_source = "manual"` and pointers advance to D.

**Acceptance Scenarios**:

1. **Given** an active route run with stops A, B, C pending, **When** the driver confirms stop B, **Then** stops A and B are marked passed with `pass_source = "manual"`, `last_passed_stop_id` = B, `next_stop_id` = C.
2. **Given** a deferred geofence event for stop C and stops A, B manually confirmed, **When** the deferred event is resubmitted, **Then** stop C is now head-of-line and can be processed.

---

### User Story 4 - Stops Seeded and Progress Initialized at Shift Start (Priority: P2)

When a driver starts a shift, the system creates all `route_run_stops` rows as pending and sets `next_stop_id` to the first stop. This gives the read side a stable pointer before the first geofence event arrives.

**Why this priority**: Without eager seeding, the read side has no `next_stop_id` until the first geofence or manual confirm, causing a gap where commuters see no next-stop information.

**Independent Test**: Can be tested by starting a shift and immediately querying the route run, verifying all stop rows exist as pending and `next_stop_id` is set.

**Acceptance Scenarios**:

1. **Given** a route with 10 scheduled stops, **When** a driver starts a shift, **Then** 10 `route_run_stops` rows are created with status "pending" and `next_stop_id` is set to the first stop by route order.
2. **Given** a route run that already has seeded stops from a previous shift, **When** a new shift starts on the same service date, **Then** existing stop rows are preserved (not duplicated) and `next_stop_id` is recomputed.

---

### User Story 5 - Read-Side Uses Persisted Progress Only (Priority: P2)

The progress resolver always uses the persisted `next_stop_id` pointer from `route_runs` for ETA targeting. The multi-mode branching (legacy/shadow/persisted) is removed; there is one code path. If the pointer is missing or invalid, a single self-heal derives it from current contiguous `route_run_stops` state, repairs the pointer, and continues.

**Why this priority**: Eliminating the feature-flag branching reduces code complexity and removes the risk of serving stale or conflicting progress depending on environment configuration.

**Independent Test**: Can be tested by querying a route's progress and verifying ETA targets the persisted `next_stop_id`, with no environment variable affecting behavior.

**Acceptance Scenarios**:

1. **Given** a route run with `next_stop_id` pointing to stop B, **When** the progress resolver runs, **Then** ETA is computed targeting stop B regardless of any environment variable.
2. **Given** a route run with `next_stop_id` NULL or pointing to an already-passed stop, **When** the progress resolver runs, **Then** it derives the correct next stop from contiguous `route_run_stops`, persists the repaired pointer, logs `progress_pointer_healed`, and returns ETA for the repaired stop.

---

### User Story 6 - Mobile Config Resync Re-registers Geofences (Priority: P2)

When the tracker app detects a `configVersion` mismatch from the server, it re-fetches the geofence configuration AND immediately re-registers device geofences with the updated regions, rather than waiting for the next app restart.

**Why this priority**: Without immediate re-registration, schedule changes (new stops, moved stops, radius adjustments) don't take effect until the driver restarts the app, leaving a gap in geofence coverage.

**Independent Test**: Can be tested by changing a stop's coordinates on the server, sending a ping that returns the new configVersion, and verifying the device re-registers geofences without restart.

**Acceptance Scenarios**:

1. **Given** the tracker has cached configVersion "v1" and the server returns "v2", **When** the ping response is processed, **Then** the tracker fetches the new config, stores it, and re-registers all geofences with the updated regions.
2. **Given** the config re-fetch fails (network error), **When** the mismatch is detected, **Then** the tracker retains old geofences and retries on the next ping.

---

### User Story 7 - Standardized Device Geofence Radii (Priority: P3)

The tracker config endpoint returns one geofence region per unique stop location. When multiple schedule entries share a location (grouped by `stop_group_id` or coordinates), the effective radius is the minimum of all non-null configured values in that group, clamped between 100m and 150m, defaulting to 150m. If grouped entries disagree on radius, a structured warning is logged.

**Why this priority**: Prevents inconsistent geofence registration when the same physical stop has different radius values across schedule entries.

**Independent Test**: Can be tested by creating grouped stops with conflicting radii and verifying the config response uses the clamped minimum and a warning is logged.

**Acceptance Scenarios**:

1. **Given** two schedule entries sharing a stop group with radii 120m and 180m, **When** the tracker config is requested, **Then** the effective radius is 120m (min of non-null, within 100-150 range) and a disagreement warning is logged.
2. **Given** a stop group with radii 80m and 130m, **When** the tracker config is requested, **Then** the effective radius is 100m (min=80 clamped to floor) and a warning is logged.
3. **Given** a stop group with all null radii, **When** the tracker config is requested, **Then** the effective radius is 150m (default).

---

### Edge Cases

- What happens when a geofence event arrives before the shift has started? The event is stored but marked `no_match` (no active shift gate).
- What happens when a geofence event arrives for a stop that has already been passed? The event is idempotent; the stop remains passed and the event is acknowledged.
- What happens when all stops are passed and another geofence event arrives? No pending stops to match; event is stored as `no_match`.
- What happens when the tracker submits the same geofence event twice? Deduplication via `(van_id, event_id)` unique constraint ensures idempotency.
- What happens when an ungeocoded stop (no coordinates) precedes a geocoded stop? The ungeocoded stop blocks advancement of the geocoded stop in the contiguous-prefix guard, requiring manual confirm to advance past it.
- What happens during the rollout transition when some runs have GPS-inferred progress and others have device-geofence progress? A one-time reconciliation repairs active runs by recomputing contiguous prefixes and persisting correct pointers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: GPS ping ingestion MUST store pings, update van position, and perform road snapping, but MUST NOT modify `route_run_stops` status or `route_runs` progress pointers.
- **FR-002**: GPS batch ingestion MUST store pings and update van position, but MUST NOT modify `route_run_stops` status or `route_runs` progress pointers.
- **FR-003**: Device geofence event processing MUST mark the matched stop as passed and update `route_runs` progress pointers (`last_passed_stop_id`, `next_stop_id`, `progress_updated_at`) within the same operation.
- **FR-004**: Device geofence event processing MUST only advance the head-of-line pending stop (contiguous-prefix guard). Non-adjacent events MUST be deferred with status `received` for retry on subsequent requests.
- **FR-005**: Manual stop confirmation MUST mark the confirmed stop and all prior pending stops as passed, enforce the canonical contiguous prefix, and update `route_runs` progress pointers.
- **FR-006**: Shift start MUST seed all `route_run_stops` rows as pending and initialize `next_stop_id` to the first stop in route order.
- **FR-007**: The progress resolver MUST always use the persisted `next_stop_id` for ETA targeting, with no environment-variable-based mode selection.
- **FR-008**: The progress resolver MUST self-heal when `next_stop_id` is missing, invalid, or non-adjacent: derive the correct pointer from contiguous `route_run_stops`, persist the repair, log `progress_pointer_healed`, and continue.
- **FR-009**: A shared helper MUST compute the canonical contiguous prefix from `route_run_stops`, heal non-contiguous rows, and persist progress pointers. This helper MUST be used by both device geofence processing and manual confirmation.
- **FR-010**: The tracker app MUST re-register device geofences immediately after a successful config re-fetch triggered by a `configVersion` mismatch.
- **FR-011**: The tracker config endpoint MUST compute effective radius per geofence region as `clamp(min(non-null configured radii in group), 100, 150)` with a default of 150m. Disagreements within a group MUST produce a structured warning log.
- **FR-012**: GPS corroboration in device geofence processing MUST remain soft and non-blocking: it adjusts confidence metadata but MUST NOT prevent a valid head-of-line geofence event from advancing progress.
- **FR-013**: The same-request "retry deferred geofence after GPS inference" branch MUST be removed. Deferred events are retried naturally when resubmitted on subsequent pings.
- **FR-014**: The `TRACKING_PROGRESS_SOURCE` environment variable and all legacy/shadow mode branching MUST be removed from the progress resolver and deployment documentation.
- **FR-015**: A one-time reconciliation MUST be available for active runs during rollout: seed missing `route_run_stops`, recompute contiguous prefix, and persist repaired pointers.

### Key Entities

- **Route Run**: A daily instance of a route. Carries progress pointers (`last_passed_stop_id`, `next_stop_id`, `progress_updated_at`) that reflect the canonical contiguous progression state.
- **Route Run Stop**: One row per scheduled stop per run. Status is either `pending` or `passed`. Written only by device geofence processing or manual confirmation.
- **Tracking Geofence Event**: Ledger of device-side geofence enter events. Status is `received` (pending/deferred), `matched` (successfully advanced a stop), or `no_match` (no applicable stop).
- **Van Location Ping**: Immutable GPS telemetry record. Used for live position, road snapping, ETA distance input, and health monitoring. Never used for stop progression.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After deployment, zero stop status changes originate from GPS pings. All `pass_source` values on new `route_run_stops` rows are either `device_geofence` or `manual`.
- **SC-002**: No new `backfill` values appear in `route_run_stops.pass_source` after deployment.
- **SC-003**: Route progress pointers (`next_stop_id`) are non-null within 5 seconds of shift start, before any geofence event arrives.
- **SC-004**: Commuters see accurate next-stop and ETA information that matches the van's actual physical progression through stops, with no false advancement (stop shown as passed before the van arrives).
- **SC-005**: The progress resolver produces identical behavior regardless of environment configuration (no feature-flag dependent behavior).
- **SC-006**: When a schedule change occurs, the tracker app re-registers geofences within one ping cycle (typically under 30 seconds) without requiring an app restart.
- **SC-007**: Existing active runs are reconciled during rollout with no manual intervention required beyond running the reconciliation script.

## Scope Boundaries

### In Scope

- Removing GPS-based stop inference from ping ingestion (main and batch routes)
- Wiring device geofence processing to update progress pointers
- Extracting shared canonical-prefix + pointer-persist helper
- Seeding stops and initializing pointers at shift start
- Removing `TRACKING_PROGRESS_SOURCE` multi-mode branching
- Fixing mobile config resync to immediately re-register geofences
- Standardizing grouped geofence radii with clamping
- Removing the deferred-retry-after-inference branch
- One-time rollout reconciliation script
- Cleanup of env var from docs and configuration

### Out of Scope

- ETA/OSRM quality improvements (unless directly required to remove GPS inference dependency)
- Changes to `trackingStatus` vs `runStatus` separation
- Collapsing background location task, buffering, backoff, or batch flush in the tracker app
- Device geofence radii below 100m
- Automatic skip of missed geofences (manual confirm is the official fallback)
- Schema migrations (existing tables and columns are sufficient)

## Assumptions

- Historical `pass_source` values (`geofence_raw`, `geofence_snapped`, `backfill`) remain valid in old data but no new writes use them.
- The `inferStopProgress()` function can be safely removed from the hot path without a schema migration; the function itself may be retained as dead code initially and cleaned up separately.
- The contiguous-prefix guard already implemented in device geofence processing correctly defers non-adjacent events; this spec wires it to also persist pointers.
- The `enforceCanonicalPrefix()` helper is correct and reusable as-is; the change is extracting the fetch-heal-persist wrapper around it.
- The tracker app's geofence registration function can be called after config re-fetch without side effects on the active background location task.
