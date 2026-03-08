# Feature Specification: Fix Stale GPS Guard Blocking All Pings

**Feature Branch**: `043-fix-stale-gps-guard`
**Created**: 2026-03-06
**Status**: Draft
**Input**: Incident report `docs/execution/0065-stale-gps-fix-guard-incident.md` — stale GPS fix guard rejects 100% of GPS callbacks after cold start, boot restart, or app respawn.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tracker Recovers GPS After Cold Start (Priority: P1)

After a cold start (manual launch, boot restart, or OS respawn), the tracker should begin sending location pings as soon as GPS hardware provides usable fixes, even if the first few fixes carry slightly older timestamps due to cached satellite data.

**Why this priority**: This is the core bug — without this fix, the tracker silently sends zero data after any restart, completely breaking real-time tracking for all vans.

**Independent Test**: Start the tracker app after a fresh kill or device reboot. Observe that pings reach the server within 2 minutes, even if the device is stationary and GPS hardware is returning cached fixes.

**Acceptance Scenarios**:

1. **Given** the tracker app was just cold-started (first launch after kill/reboot), **When** GPS hardware returns cached fixes with timestamps up to 120 seconds old and the van is stationary (speed <= 1 m/s or null), **Then** the tracker accepts those fixes and sends pings to the server.
2. **Given** the tracker app has been running and sending pings normally, **When** GPS returns a fix older than 60 seconds, **Then** the fix is rejected (existing behavior preserved for steady-state operation).
3. **Given** the tracker is in a cold-start gap (no successful send in the last 2+ minutes) and the van is moving (speed > 1 m/s), **When** GPS returns a cached fix older than 60 seconds, **Then** the fix is still rejected because a stale fix from a moving van could be 1.5+ km off position.

---

### User Story 2 - Diagnostic Log Shows Filter Reasons (Priority: P2)

When diagnosing tracker issues from the device, the operations team can see which specific filter is rejecting GPS fixes (accuracy, duplicate timestamp, or stale fix) rather than a single undifferentiated "filtered" counter.

**Why this priority**: The current diagnostic log was insufficient to diagnose this incident — all three filters log identically. Adding per-reason counters enables faster field diagnosis without needing server-side cross-referencing.

**Independent Test**: Export the diagnostic log from a device and verify that the summary rows show per-reason filter breakdown (accuracy, duplicate, stale) instead of a single `flt` counter.

**Acceptance Scenarios**:

1. **Given** a GPS callback is rejected due to low accuracy, **When** the diagnostic log is reviewed, **Then** the summary shows the rejection counted under the accuracy-specific counter.
2. **Given** a GPS callback is rejected due to duplicate timestamp, **When** the diagnostic log is reviewed, **Then** the summary shows the rejection counted under the duplicate-specific counter.
3. **Given** a GPS callback is rejected by the stale fix guard, **When** the diagnostic log is reviewed, **Then** the summary shows the rejection counted under the stale-specific counter.
4. **Given** multiple filters reject fixes in the same minute, **When** the diagnostic log is reviewed, **Then** the total `flt` counter equals the sum of all per-reason counters, and each reason is distinguishable.

---

### Edge Cases

- What happens when `lastSentTime` has never been set (brand-new install, first-ever run)? The cold-gap condition should activate since no successful send has ever occurred.
- What happens when the device clock is significantly wrong (e.g., after a factory reset before NTP sync)? The stale guard should still reject wildly old fixes.
- What happens when GPS returns a fix with `speed = null` or very low speed (GPS drift)? Speed <= 1 m/s or null is treated as stationary for the cold-gap relaxation, since GPS drift commonly produces small non-zero speeds on parked vehicles.
- What happens during the transition from cold-gap to steady-state? Once a successful send occurs, `lastSentTime` updates and the normal 60-second threshold resumes immediately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept GPS fixes up to 120 seconds old when the last successful send was more than 2 minutes ago AND the van is stationary (speed <= 1 m/s or null).
- **FR-002**: System MUST continue to reject GPS fixes older than 60 seconds during normal steady-state operation (last successful send within 2 minutes).
- **FR-003**: System MUST reject GPS fixes older than 60 seconds when the van is moving (speed > 1 m/s), regardless of cold-gap state, to prevent large position errors.
- **FR-004**: System MUST record which filter rejected each GPS callback (accuracy, duplicate timestamp, or stale fix) in the per-minute diagnostic summary.
- **FR-005**: System MUST maintain the total filtered counter (`flt`) for backward compatibility alongside the per-reason counters.
- **FR-007**: System MUST include per-reason filter counters in the on-device diagnostic summary format string so operators can see the breakdown without exporting raw logs.
- **FR-006**: System MUST treat the first-ever run (no persisted `lastSentTime`) as a cold-gap scenario.

### Key Entities

- **MinuteSummary**: Per-minute diagnostic bucket — extended with per-reason filter counters (`flt_acc`, `flt_dup`, `flt_stale`) alongside the existing total `flt`.
- **FilterReason**: Categorization of why a GPS fix was rejected — one of: accuracy too low, duplicate GPS timestamp, or stale fix age.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a cold start (kill + relaunch or device reboot), the tracker sends at least one ping to the server within 2 minutes, even when the device is stationary.
- **SC-002**: During steady-state tracking, GPS fixes older than 60 seconds continue to be rejected (no regression in filtering quality).
- **SC-003**: Stale cached fixes from a moving van (speed > 1 m/s) are never accepted with the relaxed threshold — position accuracy is preserved.
- **SC-004**: The diagnostic log export shows per-reason filter breakdowns, enabling field diagnosis of filtering issues without server-side data.
- **SC-005**: The sum of per-reason filter counters equals the total `flt` counter in every minute summary row.

## Clarifications

### Session 2026-03-06

- Q: Should "stationary" use a speed threshold instead of strict zero, given GPS drift produces small non-zero speeds on parked vans? → A: Yes — stationary means speed <= 1 m/s (~3.6 km/h) or null. This accounts for GPS drift observed in real-world data (e.g., 0.08 m/s while parked).
- Q: Should the diagnostic summary format string include per-reason filter counters, or only expose them in raw JSON export? → A: Update format string to include per-reason breakdown (e.g., `flt:9 [acc:2 dup:1 st:6]`). This is the primary way operators read diagnostics on-device.

## Assumptions

- Android GPS hardware typically acquires a fresh satellite lock within 30-120 seconds after a cold start, depending on indoor/outdoor conditions and device quality.
- A 120-second stale threshold for stationary fixes is safe because a stationary van's position does not change — a cached fix is still accurate.
- GPS drift commonly produces small non-zero speeds (e.g., 0.08 m/s) on parked vehicles; a 1 m/s threshold safely distinguishes drift from actual movement.
- The existing `lastSentTime` persistence to AsyncStorage (`@lastSentAt`) is reliable and correctly restored on cold start.

## Scope Boundaries

**In scope**:
- Relaxing the stale fix threshold after cold gaps (stationary only)
- Adding per-reason filter counters to diagnostic summaries
- Passing filter reason strings to `logFiltered()`

**Out of scope**:
- Changing the accuracy threshold (50m)
- Changing the duplicate timestamp guard logic
- Modifying how GPS fixes are requested from the OS
- Changes to the server-side tracking API
- Redesigning the diagnostics screen layout or adding new screens
