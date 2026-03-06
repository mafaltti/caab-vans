# Feature Specification: Tracker Diagnostic Log

**Feature Branch**: `041-tracker-diag-log`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Tracker diagnostic log for driver troubleshooting"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Support Staff Diagnoses Tracking Failures (Priority: P1)

A support staff member receives a complaint from a driver: "tracking wasn't working yesterday." The support person asks the driver to open the diagnostics screen and share the log. The log reveals a 45-minute gap in minute summaries (background task was killed by the OS) followed by repeated error events with status 401 (auth token expired). The support person identifies both root causes without needing physical access to the phone.

**Why this priority**: This is the core reason the feature exists. Without it, tracking failures are completely opaque and undiagnosable.

**Independent Test**: Can be tested by running the tracker for a period, then opening the diagnostics screen and verifying that log entries accurately reflect what happened.

**Acceptance Scenarios**:

1. **Given** the tracker has been running for at least 10 minutes, **When** the driver opens the diagnostics screen, **Then** the screen displays minute-by-minute summaries showing send/fail/buffered/throttled/filtered/callback counts.
2. **Given** the tracker encountered errors (network loss, server errors, task kill), **When** the driver opens the diagnostics screen, **Then** individual event entries appear with timestamps and details describing each error or state change.
3. **Given** the tracker's background task was killed by the OS for 12 minutes, **When** the driver opens the diagnostics screen, **Then** the gap in minute summaries is visible (no entries for the missing minutes).

---

### User Story 2 - Driver Self-Diagnoses Common Issues (Priority: P2)

A driver notices the van's position hasn't updated on the passenger app. They open the diagnostics screen on their own phone and see that all recent minutes show high "filtered" counts (GPS filtered due to poor accuracy). They realize they're in a tunnel and the GPS signal is weak. No support call needed.

**Why this priority**: Empowers drivers to resolve simple issues independently, reducing support burden.

**Independent Test**: Can be tested by simulating GPS accuracy issues and verifying the diagnostics screen shows filtered counts, allowing the driver to understand the problem.

**Acceptance Scenarios**:

1. **Given** the tracker is running and GPS accuracy is poor, **When** the driver opens the diagnostics screen, **Then** minute summaries show high filtered counts indicating GPS quality issues.
2. **Given** the tracker is running and the van is stationary, **When** the driver opens the diagnostics screen, **Then** minute summaries show high throttled counts, which is normal behavior.
3. **Given** the tracker lost network connectivity for 20 minutes, **When** the driver opens the diagnostics screen, **Then** a "network down" event is visible, followed by minutes with high buffered counts, then a "network up" event and a "flush done" event.

---

### User Story 3 - Driver Shares Log for Remote Support (Priority: P2)

A driver experiences intermittent tracking issues. Support asks them to share the diagnostic log. The driver taps "Share Log" on the diagnostics screen, which generates a file and opens the device's native share sheet. The driver sends it via WhatsApp to the support group. Support reviews the structured data to pinpoint the issue.

**Why this priority**: Enables remote troubleshooting without physical access to the device, critical for field operations.

**Independent Test**: Can be tested by tapping "Share Log" and verifying the native share sheet opens with a properly formatted file.

**Acceptance Scenarios**:

1. **Given** the diagnostics screen is open with log data, **When** the driver taps "Share Log", **Then** the device's native share sheet opens with a file ready to share.
2. **Given** the driver shares the log file, **When** a support person opens the file, **Then** the file contains valid structured data with all log entries.

---

### User Story 4 - Driver Clears Old Diagnostic Data (Priority: P3)

At the start of a new day, a driver wants to clear yesterday's diagnostic data so only today's events appear. They tap "Clear Log" on the diagnostics screen and confirm. The log is reset.

**Why this priority**: Convenience feature to keep the diagnostics screen focused on the current day.

**Independent Test**: Can be tested by clearing the log and verifying the diagnostics screen shows no entries.

**Acceptance Scenarios**:

1. **Given** the diagnostics screen has accumulated log entries, **When** the driver taps "Clear Log", **Then** all log entries are removed and the screen shows an empty state.

---

### Edge Cases

- What happens when the log reaches maximum capacity? Oldest entries are dropped to make room for new ones, preserving the most recent data.
- What happens if the app is force-closed before the log is flushed to disk? In-memory entries since the last flush are lost. This is an acceptable trade-off since flushes happen approximately once per minute.
- What happens when stored log data is corrupted or unreadable? The log resets to empty and begins recording fresh data.
- What happens if the driver opens the diagnostics screen while the tracker is not running? The screen shows any previously recorded log data, or an empty state if no data exists.
- What happens if the driver taps "Share Log" when the log is empty? The share action either shows an empty-state message or shares an empty file.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST record minute-level summaries of tracker activity including counts of: successful sends, failed sends, buffered pings, throttled pings, filtered pings, and task callbacks.
- **FR-002**: System MUST record individual event entries for state changes and errors, including: tracking start/stop, cold starts, task errors, buffer flushes, buffer overflow, network connectivity changes, server errors, and movement state changes.
- **FR-003**: System MUST persist diagnostic log data to device storage so it survives app restarts.
- **FR-004**: System MUST retain up to 1,100 log entries, covering approximately 15 hours of continuous operation (a full driver shift).
- **FR-005**: System MUST drop oldest entries when the log exceeds maximum capacity, preserving the most recent data.
- **FR-006**: System MUST display a diagnostics screen showing a summary bar (totals for sent/failed/buffered/throttled/filtered) and a timeline view of all log entries, newest first.
- **FR-007**: System MUST visually distinguish between normal operation (all sends successful), degraded operation (failures or buffering present), and idle periods (all throttled/filtered) in the timeline view.
- **FR-008**: System MUST allow the driver to share the diagnostic log as a file via the device's native share mechanism.
- **FR-009**: System MUST allow the driver to clear all diagnostic log data.
- **FR-010**: System MUST record network connectivity transitions (online/offline) only on state change, not on every check.
- **FR-011**: Diagnostic logging MUST NOT noticeably impact tracker performance. Counter increments must be synchronous with no disk I/O. Disk writes should occur no more than approximately once per minute during steady-state operation.
- **FR-012**: The diagnostics screen MUST be accessible from the app's settings or main navigation.

### Key Entities

- **Minute Summary**: An aggregation of tracker activity counts for a single calendar minute, proving the background task was alive and showing the distribution of outcomes (sent, failed, buffered, throttled, filtered, callbacks).
- **Event Entry**: A timestamped record of a discrete state change or error, capturing what happened and optional detail text (max 80 characters).
- **Diagnostic Log**: The ordered collection of minute summaries and event entries, persisted to device storage, with a maximum capacity of 1,100 entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Diagnostic log covers a full 15-hour driver shift without losing early-day data (at least 900 minute summaries plus event entries fit within capacity).
- **SC-002**: Support staff can determine the root cause of a tracking failure (GPS issues, network loss, task kill, server errors, auth problems) solely from the diagnostic log in under 5 minutes.
- **SC-003**: Diagnostic log storage usage stays under 100KB on device.
- **SC-004**: Logging overhead adds no perceptible latency to the tracker's GPS callback processing (counter increments are synchronous, no disk I/O in the hot path).
- **SC-005**: Drivers can share the diagnostic log with support in under 30 seconds (open screen, tap share, pick messaging app).
- **SC-006**: Gaps in tracker operation (OS-killed background task) are visually identifiable in the diagnostics timeline without requiring technical knowledge.

## Assumptions

- Drivers have access to a share-capable messaging app (WhatsApp, Telegram, email) on their device.
- The tracker app already has a settings or navigation area where the diagnostics screen can be added.
- Device storage has sufficient capacity for the diagnostic log (under 100KB).
- The diagnostic log does not need to be sent to a server automatically; sharing is manual and driver-initiated.
- Log data does not need to persist across app uninstalls.
