# Tasks: Tracker Diagnostic Log

**Input**: Design documents from `/specs/041-tracker-diag-log/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: No test framework exists in van-tracker. Tests are manual only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Install dependencies needed for the share feature

- [x] T001 Install `expo-file-system` and `expo-sharing` in `apps/van-tracker/` via `npx expo install expo-file-system expo-sharing`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the core diagnostic log module that ALL user stories depend on

- [x] T002 Create `apps/van-tracker/src/storage/diag-log.ts` with types (`MinuteSummary`, `EventEntry`, `EventType`, `LogEntry`), in-memory state (`diskLog`, `currentMinute`, `pendingEvents`, `lastNetworkState`), helper functions (`getMinuteTs`, `ensureCurrentMinute`, `countOf`), public counter API (`logOk`, `logFail`, `logBuffered`, `logThrottled`, `logFiltered`, `logCallback`), public event API (`logEvent`, `logNetworkState`), and disk persistence (`flushLog`, `getLog`, `clearLog`). Max 1,100 entries, AsyncStorage key `@diagLog`. See `data-model.md` for entity definitions and `docs/execution/0059-tracker-diagnostic-log.md` for reference implementation.
- [x] T003 Integrate diagnostic log counter calls into `apps/van-tracker/src/location/task.ts`: add `logCallback()` at task callback entry, `logEvent("task_error", ...)` on task error, `logEvent("cold_start")` on cold-start hydration, `logFiltered()` at accuracy/duplicate/stale filters, `logThrottled()` at stationary/distance/time throttle points, `logNetworkState()` after NetInfo check, `logBuffered()` when buffering due to no network or network error, `logOk()` on send success, `logFail()` on rate-limited/backoff, `logEvent("error", ...)` on 400/401/unexpected errors, `logEvent("flush", ...)` on buffer flush start/completion. Wire `flushLog()` to minute rollover detection and after error events. See design doc integration points table for exact placement.
- [x] T004 Integrate diagnostic log events into `apps/van-tracker/src/location/tracking.ts`: add `logEvent("tracking_start")` + `await flushLog()` in `startTracking()`, add `logEvent("tracking_stop")` + `await flushLog()` in `stopTracking()`

**Checkpoint**: Core log module is recording data. All tracker activity is being logged. Ready for UI.

---

## Phase 3: User Story 1 - Support Staff Diagnoses Tracking Failures (Priority: P1) MVP

**Goal**: Provide a diagnostics screen that displays minute summaries and event entries so support staff can identify tracking failure root causes.

**Independent Test**: Start tracking on a device, wait 2-3 minutes, open diagnostics screen. Verify minute summaries with counter values appear. Toggle airplane mode to trigger network events. Stop/start tracking to see event entries. Kill the app and reopen to verify a gap in summaries is visible.

### Implementation for User Story 1

- [x] T005 [US1] Create `apps/van-tracker/app/diagnostics.tsx` with: summary bar at top (computed totals for ok/fail/buf/thr/flt across all minute summaries), FlatList timeline view (newest first) rendering both minute summary rows and event entry rows. Minute rows show time (HH:mm) and counter values (ok, fail, buf, thr, flt, cb). Event rows show time (HH:mm:ss) and event type + detail. Use `getLog()` to load data on screen focus.
- [x] T006 [US1] Add visual status indicators to timeline rows in `apps/van-tracker/app/diagnostics.tsx`: green background for minute rows where all sends succeeded (ok > 0, fail === 0, buf === 0), yellow for minutes with any fail or buf > 0, red for minutes where fail > ok, gray for idle minutes (all thr/flt, ok === 0). Event rows: red for error/task_error/buffer_full, blue for state_change/network_up/network_down, gray for flush/cold_start.
- [x] T007 [US1] Register the diagnostics route in `apps/van-tracker/app/_layout.tsx` by adding a `<Stack.Screen name="diagnostics" />` entry with appropriate header title ("Diagnostics")
- [x] T008 [US1] Add a "Diagnostics" navigation button/link in `apps/van-tracker/app/settings.tsx` that navigates to the diagnostics screen via `router.push("/diagnostics")`

**Checkpoint**: Diagnostics screen is accessible and shows all log data. Support staff can read minute summaries and events to diagnose failures.

---

## Phase 4: User Story 2 - Driver Self-Diagnoses Common Issues (Priority: P2)

**Goal**: The diagnostics screen (from US1) already enables driver self-diagnosis. This story ensures the visual indicators are clear enough for non-technical drivers.

**Independent Test**: Run tracker while simulating poor GPS (tunnel), verify high filtered counts with gray rows. Run tracker while stationary, verify high throttled counts with gray rows. Toggle airplane mode, verify network_down/network_up events with colored indicators.

### Implementation for User Story 2

- [x] T009 [US2] Add empty state to `apps/van-tracker/app/diagnostics.tsx`: when `getLog()` returns empty array, show a centered message explaining no diagnostic data is available and that data appears once tracking starts

**Checkpoint**: Drivers can understand tracker status at a glance through color-coded timeline and empty state messaging.

---

## Phase 5: User Story 3 - Driver Shares Log for Remote Support (Priority: P2)

**Goal**: Allow drivers to export the diagnostic log as a JSON file and share it via the device's native share sheet (WhatsApp, Telegram, email, etc.).

**Independent Test**: Open diagnostics screen with log data, tap "Share Log", verify native share sheet appears with a JSON file. Send file to yourself and verify it contains valid JSON with all log entries.

### Implementation for User Story 3

- [x] T010 [US3] Add "Share Log" button to `apps/van-tracker/app/diagnostics.tsx` that: calls `getLog()`, writes JSON to `FileSystem.cacheDirectory/caab-tracker-log-YYYY-MM-DD.json` using `expo-file-system`, then opens native share sheet via `Sharing.shareAsync(fileUri, { mimeType: "application/json" })`. Disable button if log is empty (show toast or alert explaining no data to share).

**Checkpoint**: Drivers can share diagnostic logs with support via any messaging app.

---

## Phase 6: User Story 4 - Driver Clears Old Diagnostic Data (Priority: P3)

**Goal**: Allow drivers to clear the diagnostic log to start fresh.

**Independent Test**: Accumulate log data, tap "Clear Log", verify all entries are removed and empty state is shown.

### Implementation for User Story 4

- [x] T011 [US4] Add "Clear Log" button to `apps/van-tracker/app/diagnostics.tsx` that shows a confirmation alert, then calls `clearLog()` from diag-log module and refreshes the screen to show empty state

**Checkpoint**: Drivers can reset diagnostic data for a clean view of the current day.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T012 Run `npm run typecheck` in `apps/van-tracker/` and fix any TypeScript errors
- [x] T013 Run `npm run lint` in `apps/van-tracker/` and fix any ESLint issues
- [ ] T014 Manual validation: start tracking, run for 5+ minutes, open diagnostics, verify minute summaries and events render correctly, share log and verify JSON output, clear log and verify empty state

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (expo-file-system/expo-sharing installed)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (log module + integration complete)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (diagnostics screen exists)
- **User Story 3 (Phase 5)**: Depends on Phase 3 (diagnostics screen exists); can run in parallel with US2
- **User Story 4 (Phase 6)**: Depends on Phase 3 (diagnostics screen exists); can run in parallel with US2/US3
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on foundational phase only. Core MVP.
- **US2 (P2)**: Depends on US1 (diagnostics screen). Adds empty state UX.
- **US3 (P2)**: Depends on US1 (diagnostics screen). Adds share functionality. Can run in parallel with US2.
- **US4 (P3)**: Depends on US1 (diagnostics screen). Adds clear functionality. Can run in parallel with US2/US3.

### Parallel Opportunities

After Phase 3 (US1) completes:
- T009 (US2), T010 (US3), and T011 (US4) can all run in parallel since they modify different parts of `diagnostics.tsx`

Within Phase 2:
- T003 and T004 can run in parallel (different files: task.ts vs tracking.ts), but both depend on T002

---

## Parallel Example: After US1 Complete

```bash
# These three tasks can run in parallel after T008 completes:
Task T009: "Add empty state to diagnostics.tsx" (US2)
Task T010: "Add Share Log button to diagnostics.tsx" (US3)
Task T011: "Add Clear Log button to diagnostics.tsx" (US4)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Install dependencies (T001)
2. Complete Phase 2: Create diag-log module + integrate into task.ts/tracking.ts (T002-T004)
3. Complete Phase 3: Build diagnostics screen + navigation (T005-T008)
4. **STOP and VALIDATE**: Run tracker, verify diagnostics screen shows real data
5. This alone delivers the core diagnostic capability

### Incremental Delivery

1. Setup + Foundational → Log module recording data
2. Add US1 (diagnostics screen) → **MVP - diagnosable tracking issues**
3. Add US2 (empty state) → Better driver UX
4. Add US3 (share log) → Remote support capability
5. Add US4 (clear log) → Data management convenience
6. Polish → Quality gates pass

---

## Notes

- All file paths are relative to `apps/van-tracker/`
- The design doc at `docs/execution/0059-tracker-diagnostic-log.md` contains a reference implementation for `diag-log.ts` — use it as a guide, not a copy-paste target
- No test tasks included — van-tracker has no test framework
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
