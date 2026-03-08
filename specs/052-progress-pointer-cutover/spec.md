# Feature Specification: Progress Pointer Cutover

**Feature Branch**: `052-progress-pointer-cutover`
**Created**: 2026-03-08
**Status**: Draft
**Input**: Phase 2 progress pointer cutover — make persisted `next_stop_id` the authoritative source of truth for ETA targeting, next-stop resolution, and UI display alignment.
**Reference**: `docs/execution/0082-phase2-progress-pointer-cutover.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Next-Stop and ETA Display (Priority: P1)

A passenger viewing a route (list or detail page) always sees the same next stop referenced across the hero card, ETA countdown, timeline highlight, and map marker. Today, the ETA computation independently selects a target stop (time-based) that can disagree with the persisted progress pointer, causing the UI to suppress ETA display or show mismatched information.

**Why this priority**: This is the core consistency invariant the feature exists to enforce. Without it, passengers see missing or contradictory ETAs — the most visible defect.

**Independent Test**: Load the route detail page for an active route where the van is running late (overdue pending stops exist). Verify that `nextStop.id`, `progress.nextStopId`, ETA countdown, timeline "current" highlight, and hero card all reference the same stop.

**Acceptance Scenarios**:

1. **Given** a route is in progress and the persisted pointer points to an overdue pending stop, **When** a passenger loads the route detail page, **Then** the ETA, hero card, and timeline all reference that same overdue stop.
2. **Given** a route is in progress and the persisted pointer is valid, **When** a passenger loads the route list page, **Then** the route card displays an ETA for the same stop shown as the next stop.
3. **Given** a route is in progress and the persisted pointer matches the time-based selection, **When** a passenger loads any route view, **Then** behavior is identical to today (no regression).

---

### User Story 2 - Reliable Write Path with Observable Failures (Priority: P1)

The system must reliably persist progress pointers (next stop and last passed stop) to the run record after each GPS ping, and failures must be logged with enough context to diagnose issues. All three write operations (geofence mark, backfill mark, pointer persist) now capture errors with structured logging, and geofence failures skip the success path to prevent cascading incorrect state.

**Why this priority**: The cutover depends on trusting persisted pointers. If writes fail silently, the system serves stale data with no way to detect or recover. This must be hardened before the pointer becomes authoritative.

**Independent Test**: Simulate a pointer write failure (e.g., invalid run ID). Verify that the system logs a structured error message containing the run ID, route ID, chosen pointer values, and error details.

**Acceptance Scenarios**:

1. **Given** a GPS ping triggers stop inference, **When** the pointer write to the run record succeeds, **Then** the persisted `next_stop_id` and `last_passed_stop_id` reflect the inference result.
2. **Given** a GPS ping triggers stop inference, **When** the pointer write fails, **Then** the system logs a structured error with run ID, route ID, service date, chosen pointers, and error message.

---

### User Story 3 - ETA Computed for Explicit Target Stop (Priority: P1)

The ETA computation must accept an explicit target stop (from the persisted pointer) instead of always independently selecting the "first future pending stop." This ensures ETA is calculated for the stop the system considers "next" rather than a potentially different stop chosen by time-floor logic.

**Why this priority**: Without this, the persisted pointer and ETA target can diverge — the root cause of the consistency problem this feature solves.

**Independent Test**: Call ETA computation with an explicit target stop that is overdue (scheduled time has passed but stop is still pending). Verify the returned ETA references that overdue stop, not a later one.

**Acceptance Scenarios**:

1. **Given** an explicit target stop is provided, **When** ETA is computed, **Then** the result references that exact stop (not a time-based selection).
2. **Given** an explicit target stop is overdue but still pending, **When** ETA is computed, **Then** a valid ETA is returned for that overdue stop.
3. **Given** an explicit target stop does not exist in the current schedule, **When** ETA is computed, **Then** the result returns null ETA (graceful fallback).
4. **Given** no explicit target is provided, **When** ETA is computed, **Then** legacy time-based selection is used (backward compatibility).

---

### User Story 4 - Unified Progress Resolution (Priority: P2)

Both the route list and route detail endpoints must derive progress (run status, next stop, ETA, passed stops) through a single shared resolver rather than duplicating identical logic in each handler. This eliminates the risk of the two endpoints diverging during the cutover.

**Why this priority**: Duplication is the biggest maintainability risk during cutover. A single resolver ensures both endpoints behave identically and provides one place to add shadow mode and rollout controls.

**Independent Test**: Call both the route list and route detail endpoints for the same active route. Compare the `nextStopId`, `etaNextStopMinutes`, and `runStatus` values. They must be identical.

**Acceptance Scenarios**:

1. **Given** a route is active, **When** both the route list and route detail endpoints are called, **Then** both return identical `nextStopId`, `etaNextStopMinutes`, `delayMinutes`, and `runStatus`.
2. **Given** a route run is completed, **When** both endpoints are called, **Then** both return `nextStopId: null` even if a persisted pointer still exists on the run record.
3. **Given** the persisted pointer is missing or invalid, **When** both endpoints are called, **Then** both fall back to legacy recomputation and return consistent results.
4. **Given** a pointer write failure left the persisted pointer stale or null, **When** a passenger loads the route, **Then** the resolver falls back to legacy recomputation rather than serving stale data.

---

### User Story 5 - Shadow Mode for Safe Rollout (Priority: P2)

Operators must be able to enable a shadow mode where both legacy (time-based) and persisted-pointer progress are computed, but only legacy results are served to passengers. Mismatches between the two are logged for validation before the cutover is activated.

**Why this priority**: Shadow mode is the safety mechanism that allows validation in staging and production without affecting passengers. It must exist before the cutover switch is flipped.

**Independent Test**: Enable shadow mode, load a route where the persisted pointer differs from the time-based selection. Verify that: (a) the passenger sees the legacy result, (b) a structured mismatch log is emitted with both values and context.

**Acceptance Scenarios**:

1. **Given** shadow mode is enabled and the persisted pointer matches the legacy selection, **When** a route is loaded, **Then** no mismatch log is emitted and the passenger sees the legacy result.
2. **Given** shadow mode is enabled and the persisted pointer differs from the legacy selection, **When** a route is loaded, **Then** a structured log is emitted with route ID, run ID, run status, legacy `nextStopId`, persisted `next_stop_id`, and mismatch reason.
3. **Given** persisted mode is enabled and the pointer is valid, **When** a route is loaded, **Then** the passenger sees the persisted-pointer result.
4. **Given** persisted mode is enabled but the pointer is invalid, **When** a route is loaded, **Then** the system falls back to legacy and logs the fallback reason.

---

### User Story 6 - Completed Runs Show No Active Progress (Priority: P3)

When a run is completed, the system must not display a next stop or ETA, even if the persisted pointer still contains a value from the last active segment. This prevents passengers from seeing stale "next stop" information after a route has finished.

**Why this priority**: Edge case that protects against confusing post-completion state. Lower priority because it partially works today, but the cutover could regress it if pointer validation is missing.

**Independent Test**: Complete a route run while a persisted pointer exists. Load the route. Verify no next stop or ETA is displayed.

**Acceptance Scenarios**:

1. **Given** a run is completed and a persisted pointer exists, **When** the route is loaded, **Then** `nextStopId` is null and no ETA is displayed.
2. **Given** a run is in "waiting" state (not yet started), **When** the route is loaded, **Then** no active progress or ETA is shown.

---

### Edge Cases

- When the persisted pointer references a stop deleted from the schedule after the run started, the system treats it as invalid and falls back to legacy recomputation.
- Grouped stops (same `stop_group_id`) resolve correctly because the persisted pointer references a specific schedule entry ID, not a group. No special handling is needed — `resolveNextStop` looks up by individual ID, and the inference write path already handles group-aware geofence selection.
- During an idle break between shifts, the pointer is retained but ETA and active progress display are suppressed. The pointer re-activates when the next shift begins.
- GPS freshness and pointer freshness are orthogonal: the pointer determines *which stop* to target, GPS freshness determines *how* to compute distance/time (GPS branch vs segment vs schedule fallback). Both can be stale/fresh independently.
- When two GPS pings arrive nearly simultaneously, last-write-wins applies. Out-of-order writes self-correct on the next ping.

## Clarifications

### Session 2026-03-08

- Q: At what age should a persisted pointer be considered stale and trigger fallback to legacy? → A: 30 minutes (moderate — matches reference doc suggestion, ~2x max ping interval).
- Q: How should the system handle a pointer referencing a schedule entry that no longer exists? → A: Treat as invalid — fall back to legacy recomputation. The DB foreign key (`ON DELETE SET NULL`) handles the common case; explicit validation catches mid-run edge cases.
- Q: What concurrency strategy should pointer writes use when two GPS pings arrive nearly simultaneously? → A: Last-write-wins (current implicit behavior). Both pings run the same inference logic; out-of-order writes self-correct within seconds on the next ping.
- Q: Should the persisted pointer be trusted during an idle break between shifts? → A: Keep pointer but suppress ETA display during idle state. The pointer remains valid from the previous shift but showing active progress would mislead passengers.

### Shadow Validation Scenarios

Before activating the cutover, the following scenarios must be validated manually in shadow mode (staging first, then production):

1. Route running on time (common case — no mismatch expected)
2. Route late with all remaining stops overdue
3. Stale GPS but active shift
4. Repeated stop names / grouped stops (`stop_group_id`)
5. Idle break between shifts
6. Completed run (pointer still set on `route_runs`)
7. Missing or invalid persisted pointer

**Exit criteria**: Zero unexplained mismatches in staging over a full day of operation. In production shadow mode, mismatch rate must be below 1% of total route loads over 48 hours before switching to persisted mode. Any mismatch above this threshold must be investigated and explained before cutover.

### Post-Cutover Documentation

- Update `docs/execution/0080-tracking-final-summary.md` which currently overstates the implementation status of the pointer cutover.
- Only remove legacy next-stop recomputation after a stable period with the persisted mode active.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The ETA computation MUST accept an optional explicit target stop identifier. When provided, ETA MUST be computed for that stop instead of using internal time-based selection.
- **FR-002**: The ETA computation MUST produce a valid result for overdue pending stops (stops whose scheduled time has passed but whose status is still pending).
- **FR-003**: When no explicit target is provided, ETA MUST fall back to the existing time-based selection logic (backward compatibility).
- **FR-004**: All progress pointer writes (next stop, last passed stop) MUST capture and log write failures with structured context: run ID, route ID, service date, chosen pointer values, and error details.
- **FR-005**: All stop-status writes (geofence marks, backfill marks) MUST capture and log write failures with structured context.
- **FR-006**: A single shared progress resolver MUST be used by both the route list and route detail endpoints to derive run status, next stop, ETA, and passed stops.
- **FR-007**: The shared resolver MUST validate the persisted pointer before trusting it: the pointer must exist in the current schedule and be in a pending or acceptable state for the current run status.
- **FR-008**: When the persisted pointer is missing, stale, or invalid, the resolver MUST fall back to legacy time-based recomputation. A pointer is considered stale when `progress_updated_at` is older than 30 minutes relative to the current request time, or when it is future-dated (clock skew guard).
- **FR-009**: The system MUST support three progress source modes controlled by configuration: legacy (current behavior), shadow (compute both, serve legacy, log mismatches), and persisted (use pointer when valid, fall back to legacy).
- **FR-010**: In shadow mode, structured logs MUST be emitted for every mismatch, including route ID, run ID, run status, legacy next stop, persisted next stop, and mismatch reason.
- **FR-011**: Completed and idle runs MUST return no next stop and no ETA regardless of persisted pointer state. During idle state, the pointer is retained for re-activation on the next shift but is not surfaced to passengers.
- **FR-012**: The `nextStop.id` in the response, `progress.nextStopId`, ETA target, timeline highlight, and hero card MUST all reference the same schedule entry when tracking is active.
- **FR-013**: The route list and route detail endpoints MUST return identical progress values for the same route and service date.

### Key Entities

- **Route Run**: A daily instance of a route, holding persisted progress pointers (`next_stop_id`, `last_passed_stop_id`, `progress_updated_at`) and lifecycle state.
- **Schedule Entry**: A fixed daily stop with time and location. The pointer references a schedule entry ID.
- **Route Run Stop**: Per-run instance of a schedule entry, tracking geofence-based status transitions (pending → passed). Remains the source for `passedStopIds` and segment fallback data.
- **Progress Source Mode**: Configuration value (legacy | shadow | persisted) controlling which computation path the resolver uses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every active route view (list and detail), `nextStop.id` and `progress.nextStopId` match 100% of the time — zero mismatches in production after cutover.
- **SC-002**: ETA is displayed on every active route where a valid next stop exists — no more suppressed ETAs due to ID mismatches (suppression rate drops to zero).
- **SC-003**: Zero unexplained mismatches between legacy and persisted-pointer results during shadow validation in staging before cutover is activated.
- **SC-004**: Pointer write failure rate in production is below 0.1%, and every failure produces a structured log entry.
- **SC-005**: Both route endpoints return identical progress data for the same route — verified by automated tests and shadow-mode comparison.
- **SC-006**: No passenger-visible regression: ETA display, timeline highlighting, and hero card behavior remain stable for on-time routes (the common case) throughout the rollout.
