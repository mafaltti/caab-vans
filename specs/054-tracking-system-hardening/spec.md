# Feature Specification: Tracking System Hardening

**Feature Branch**: `054-tracking-system-hardening`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "Close remaining correctness and consistency gaps in the tracking system: auto-close orphaned active shifts, make stop-passage confidence deterministic and monotonic, stop returning misleading 0 min ETA from degraded fallback branches, and fully wire includeLastKnown through the top-level route summary."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deterministic Stop-Passage Confidence (Priority: P1)

A passenger checks the route status page. The system infers which stops the van has passed using recent GPS pings. Today, the evidence query returns an arbitrary subset of pings (unordered, capped at 50), so confidence scores can vary between identical requests under high ping volume. After this change, evidence is fetched once per inference pass, ordered by timestamp, with no arbitrary cap, producing stable and repeatable confidence scores.

**Why this priority**: Non-deterministic confidence directly affects whether stops are marked as passed and whether backfill occurs. This is the most fundamental correctness issue — it can silently change route progress between requests.

**Independent Test**: Can be tested by running inference with >50 pings in the 5-minute window and verifying identical confidence output across repeated invocations.

**Acceptance Scenarios**:

1. **Given** a van has emitted 80 pings in the last 5 minutes, **When** stop inference runs, **Then** all 80 pings are considered (no arbitrary truncation) and confidence is identical across repeated calls.
2. **Given** stop inference runs for a route with 4 stop groups, **When** evidence is needed for each group, **Then** the database is queried exactly once (not once per group) and the same ordered evidence set is reused.
3. **Given** two pings are inside a stop's geofence, **When** confidence is computed for a raw match, **Then** confidence is 0.90 (not 0.70).

---

### User Story 2 - Consistent Last-Known Route Summary (Priority: P1)

An app consumer requests a route with `includeLastKnown=true` after the route has stopped running. The progress object correctly contains the last-known next stop and ETA data. However, the top-level `nextStop` and `currentStopIndex` summary fields are null because they are gated on `isRunning`. After this change, when `includeLastKnown=true` and persisted progress exists, the top-level summary fields are populated from the progress data and a `nextStopMode` discriminator tells the consumer whether the data is live or historical.

**Why this priority**: The API is currently internally inconsistent — nested `progress` has data while top-level summary says null. This forces every consumer to special-case the response, defeating the purpose of the flag.

**Independent Test**: Can be tested by requesting a non-running route with `includeLastKnown=true` and verifying top-level `nextStop`, `currentStopIndex`, and `nextStopMode` are populated.

**Acceptance Scenarios**:

1. **Given** a route is not running and has persisted progress with `nextStopId`, **When** a consumer requests with `includeLastKnown=true`, **Then** top-level `nextStop` and `currentStopIndex` are populated from progress data and `nextStopMode = "last_known"`.
2. **Given** a route is actively running, **When** a consumer requests the route, **Then** `nextStopMode = "live"` and behavior is unchanged from today.
3. **Given** a route is not running and has no persisted progress, **When** a consumer requests with `includeLastKnown=true`, **Then** top-level summary fields remain null and `nextStopMode = null`.
4. **Given** a non-running route with persisted progress, **When** a consumer requests without `includeLastKnown`, **Then** top-level summary fields remain null (backward-compatible).

---

### User Story 3 - Honest Overdue ETA Signaling (Priority: P2)

A passenger checks ETA for a stop the van was supposed to reach 15 minutes ago. GPS is unavailable, so the system uses the segment or schedule fallback. Today it reports "0 min" (implying imminent arrival), which is misleading. After this change, the system returns `etaNextStopMinutes = null` with `etaStatus = "overdue"`, allowing the UI to show an honest "overdue / uncertain" message instead of a false "arriving now".

**Why this priority**: Misleading ETA erodes passenger trust. However, this only affects degraded (non-GPS) branches, which are less common than the primary GPS path.

**Independent Test**: Can be tested by setting up a scenario where the segment-predicted arrival is in the past and verifying the response contains `etaStatus = "overdue"` and `etaNextStopMinutes = null`.

**Acceptance Scenarios**:

1. **Given** a van's last passed stop was 30 minutes ago and the segment-predicted arrival for the next stop is 10 minutes in the past, **When** ETA is computed, **Then** `etaStatus = "overdue"`, `etaNextStopMinutes = null`, and `etaNextStopISO` contains the past prediction timestamp.
2. **Given** a van's schedule-adjusted ETA for the next stop is in the past, **When** ETA is computed via schedule fallback, **Then** `etaStatus = "overdue"` and `etaNextStopMinutes = null`.
3. **Given** a van is near a stop with fresh GPS, **When** ETA is computed, **Then** `etaNextStopMinutes = 0` remains valid and `etaStatus = "estimated"` (GPS "at stop" is not overdue).
4. **Given** a van has a valid future ETA from any branch, **When** ETA is computed, **Then** `etaStatus = "estimated"` and `etaNextStopMinutes` contains the positive value.

---

### User Story 4 - Monotonic Snapped Confidence Scoring (Priority: P2)

The system uses road-snapped GPS positions to improve stop detection accuracy. Today, snapped matches always receive 0.8 confidence regardless of corroborating evidence. After this change, snapped confidence increases monotonically as evidence strengthens: more confirming pings and lower snap displacement produce higher scores.

**Why this priority**: Improves the quality of stop-passage detection but the current flat 0.8 is functional. This is a correctness refinement, not a critical bug.

**Independent Test**: Can be tested by providing varying amounts of corroborating evidence for snapped matches and verifying confidence increases monotonically.

**Acceptance Scenarios**:

1. **Given** a snapped match where raw position is outside the geofence, **When** confidence is computed, **Then** confidence is 0.65 (lower than raw-inside match).
2. **Given** a snapped match where raw position is also inside the geofence, **When** confidence is computed, **Then** confidence is 0.85.
3. **Given** a snapped match with 2+ confirming recent pings, **When** confidence is computed, **Then** confidence increases by 0.10 (capped at 0.95).
4. **Given** a snapped match with snap displacement of 10m (below 15m threshold), **When** confidence is computed, **Then** confidence increases by 0.05 (capped at 0.95).
5. **Given** progressively stronger evidence, **When** confidence is computed at each level, **Then** each score is greater than or equal to the previous (monotonic).

---

### User Story 5 - Auto-Close Orphaned Active Shifts (Priority: P3)

An operator notices a route still showing as "running" the morning after service ended because a driver forgot to end their shift. Today, the only fix is manual intervention via the driver endpoint. After this change, a reconciliation process automatically closes shifts that are clearly orphaned: past the route's scheduled end by a grace window and with no recent activity.

**Why this priority**: This is an operational hygiene issue. It affects data correctness over time but does not impact real-time passenger-facing accuracy during active service hours. It also blocks the next day's shift start (409 CONFLICT).

**Independent Test**: Can be tested by creating an orphaned shift (past schedule + inactive) and running the reconciliation process.

**Acceptance Scenarios**:

1. **Given** an active shift on a route whose schedule ended 2 hours ago and with no GPS or progress activity for 45 minutes, **When** reconciliation runs, **Then** the shift's `ended_at` is set to the current time.
2. **Given** an active shift on a route whose schedule ended 2 hours ago but the van had a GPS fix 10 minutes ago, **When** reconciliation runs, **Then** the shift is NOT closed (still active).
3. **Given** an active shift on a route still within its schedule window, **When** reconciliation runs, **Then** the shift is NOT closed.
4. **Given** dry-run mode is enabled, **When** reconciliation runs with orphaned shifts, **Then** candidates are reported in structured logs but no data is mutated.
5. **Given** an orphaned shift was auto-closed yesterday, **When** a driver starts a new shift today, **Then** the start succeeds (no 409 CONFLICT).

---

### Edge Cases

- What happens when a route has midnight-crossing schedules? Reconciliation uses the existing same-day schedule model; midnight-crossing remains out of scope.
- What happens when there are zero pings in the 5-minute confidence window? Confidence defaults to the base score for the match type with zero corroborating evidence.
- What happens when both segment and schedule fallback ETAs are overdue? The first computed branch (segment) returns the overdue status; no cascade to schedule is needed since the overdue signal is already clear.
- What happens when `includeLastKnown=true` is used on a route that never ran? Top-level summary remains null with `nextStopMode = null`.
- What happens when OSRM is unavailable and segment ETA cannot be computed? Falls through to schedule fallback as today; if schedule is also overdue, returns overdue status.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch stop-passage evidence exactly once per inference invocation, ordered by device timestamp descending, with no arbitrary row limit.
- **FR-002**: System MUST reuse the single ordered evidence set across all stop groups within an inference pass.
- **FR-003**: System MUST compute raw match confidence as 0.70 (fewer than 2 confirming pings) or 0.90 (2+ confirming pings).
- **FR-004**: System MUST compute snapped match confidence using a tiered model: 0.65 (raw outside geofence), 0.85 (raw also inside), with +0.10 for 2+ confirming pings and +0.05 for snap displacement at or below 15m, capped at 0.95.
- **FR-005**: System MUST preserve backfill gating at `pass_confidence > 0.7` with existing gap-based scaling (gap 0-1: 0.7, gap 2-3: 0.5, else: 0.3).
- **FR-006**: System MUST return `etaStatus = "overdue"` and `etaNextStopMinutes = null` when segment or schedule branch predicts arrival in the past for a still-pending stop.
- **FR-007**: System MUST return `etaStatus = "estimated"` when a valid future ETA exists from any computation branch.
- **FR-008**: System MUST return `etaStatus = "none"` when there is no next stop or no ETA target.
- **FR-009**: System MUST preserve GPS branch behavior: `etaNextStopMinutes = 0` remains valid when the van is at or very near the stop.
- **FR-010**: System MUST populate top-level `nextStop` and `currentStopIndex` from persisted progress when `includeLastKnown=true`, `isRunning = false`, and `progress.nextStopId` resolves to a schedule entry.
- **FR-011**: System MUST include `nextStopMode` in route responses: `"live"` for active routes, `"last_known"` for non-running routes with persisted progress and `includeLastKnown=true`, `null` otherwise.
- **FR-012**: System MUST keep `isRunning` semantics unchanged — tied to `runStatus === "in_progress"`.
- **FR-013**: System MUST provide a reconciliation process that auto-closes orphaned shifts when: `ended_at IS NULL`, route is past scheduled end by at least 90 minutes, and no activity for at least 30 minutes.
- **FR-014**: Reconciliation MUST define last activity as the most recent of: van's last GPS fix, route run's progress update timestamp, and shift start time.
- **FR-015**: Reconciliation MUST support a dry-run mode that reports candidates without mutating data.
- **FR-016**: Reconciliation MUST emit structured logs with closed shift IDs and counts.
- **FR-017**: System MUST retain the existing 50m snap-eligibility threshold for determining whether snapped coordinates are used.

### Key Entities

- **Route Shift**: Represents a driver's active work session on a route run. Key attributes: start time, end time (null when active), associated run and driver. Orphaned when end time remains null past service hours.
- **Stop-Passage Evidence**: The set of recent GPS pings used to determine whether a van has passed a stop. Key attributes: device timestamp, latitude, longitude. Must be ordered and complete within the time window.
- **ETA Result**: The computed arrival prediction for the next stop. Key attributes: predicted arrival time, minutes remaining, computation source (GPS/segment/schedule), and status (estimated/overdue/none).
- **Route Progress**: The resolved state of a route run including passed stops, next stop, ETA, and run status. Extended with ETA status for overdue signaling.
- **Route Summary**: The top-level consumer-facing fields on a route response. Extended with next-stop mode for live vs. last-known discrimination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Stop-passage confidence scores are identical across repeated inference calls for the same input data (100% determinism).
- **SC-002**: Route responses with `includeLastKnown=true` have consistent data between top-level summary and nested progress (zero internal contradictions).
- **SC-003**: Overdue stops in degraded mode display an honest "overdue" signal instead of "0 min" — consumers can distinguish "van at stop" from "prediction expired".
- **SC-004**: Snapped confidence is monotonically non-decreasing as corroborating evidence increases — no scenario where adding evidence lowers or freezes the score.
- **SC-005**: Orphaned shifts are automatically closed within one reconciliation cycle (5 minutes) after meeting the inactivity thresholds, unblocking next-day shift starts.
- **SC-006**: All five changes are backward-compatible — existing consumers that do not check new fields continue to work without modification.
- **SC-007**: All existing tracking tests continue to pass after the changes, and new tests cover each of the five hardening areas.

## Assumptions

- The canonical timezone for schedule calculations remains `America/Bahia`.
- No database schema changes are required; all changes are application-level.
- Midnight-crossing schedules remain out of scope for reconciliation.
- The reconciliation process is scheduled externally (host cron/systemd timer), not embedded in the application runtime.
- The 5-minute evidence window and 50m snap-eligibility threshold are retained from the current implementation.
- The reconciliation thresholds (90-minute grace, 30-minute inactivity, 5-minute schedule) are operational defaults that can be adjusted without code changes.
