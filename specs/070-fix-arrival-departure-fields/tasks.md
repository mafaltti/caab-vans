# Tasks: Fix Arrival/Departure Time Field Usage

**Input**: Design documents from `specs/070-fix-arrival-departure-fields/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — spec requires new test cases with distinct arrival/departure values (SC-005).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Passenger sees correct "next stop" (Priority: P1) MVP

**Goal**: Fix `getNextStop()` to use arrival time instead of departure time, so passengers see the correct next stop when stops have distinct dwell times.

**Independent Test**: Configure a stop with arrival 09:00 / departure 09:15. At 09:05, the public route page must show this stop as "next", not the following one.

### Tests for User Story 1

- [x] T001 [US1] Create test file `src/__tests__/lib/time.test.ts` with tests for `getNextStop()` using entries where `arrival_time !== departure_time` — verify the function returns the first stop whose arrival time (`time` field) is >= now, not whose departure time is >= now

### Implementation for User Story 1

- [x] T002 [US1] Fix `src/lib/time.ts:73` — change `parseTime(entry.departureTime)` to `parseTime(entry.time)` in `getNextStop()`

**Checkpoint**: `getNextStop()` returns correct stop during dwell windows. Tests pass.

---

## Phase 2: User Story 2 - Route stays active until last stop departure (Priority: P2)

**Goal**: Fix 4 locations that use last stop's `arrival_time` instead of `departure_time` for schedule window end, preventing premature "ended"/"completed"/"orphaned" status.

**Independent Test**: Configure last stop with arrival 17:00 / departure 17:30. At 17:10, route must still show as active (not ended/completed). Driver route list must agree.

### Tests for User Story 2

- [x] T003 [P] [US2] Add test in `src/__tests__/lib/time.test.ts` for `isWithinScheduleWindow()` — verify that when last stop has arrival 17:00 / departure 17:30, `now = 17:10` returns true (within window) and `now = 17:35` returns false — also include edge cases: single-stop route (window = departure_time to departure_time) and boundary condition (now == last departure_time)
- [x] T004 [P] [US2] Add test in `src/__tests__/tracking/resolve-route-progress.test.ts` for `isPastScheduleWindow` — verify that with last stop arrival 17:00 / departure 17:30, `now = 17:10` does NOT trigger "completed" status
- [x] T005 [P] [US2] Add test in `src/__tests__/tracking/resolve-route-progress.test.ts` for orphaned shift detection — verify that with last stop arrival 17:00 / departure 17:30, `scheduledEnd` is anchored to 17:30, not 17:00

### Implementation for User Story 2

- [x] T006 [P] [US2] Fix `src/lib/time.ts:51` — change `sorted[sorted.length - 1].arrival_time` to `sorted[sorted.length - 1].departure_time` in `isWithinScheduleWindow()`
- [x] T007 [P] [US2] Fix `src/lib/tracking/resolve-route-progress.ts:82` — change `sortedEntries[sortedEntries.length - 1].arrival_time` to `.departure_time` in `isPastScheduleWindow` computation
- [x] T008 [P] [US2] Fix `src/lib/tracking/resolve-route-progress.ts:390` — change `sortedEntries[sortedEntries.length - 1].arrival_time` to `.departure_time` in orphaned shift detection
- [x] T009 [P] [US2] Add test in `src/__tests__/api/driver/routes/route.test.ts` for driver API `isPastScheduleWindow` — verify that with last stop arrival 17:00 / departure 17:30, driver route listing at 17:10 does NOT show "completed" status
- [x] T010 [US2] Fix `src/app/api/driver/routes/route.ts:123` — change `sorted.map((e) => e.arrival_time)` to `sorted.map((e) => e.departure_time)` in driver API `isPastScheduleWindow`

**Checkpoint**: Routes with dwell time on last stop remain active until departure. No premature "completed" or "orphaned" transitions. Tests pass.

---

## Phase 3: User Story 3 - Geofence matching uses correct early arrival window (Priority: P3)

**Goal**: Fix 2 locations that anchor the 30-minute early arrival window to departure_time instead of arrival_time, preventing the window from being widened by dwell time.

**Independent Test**: Configure a stop with arrival 10:00 / departure 10:30. A geofence event at 09:25 (35 min before arrival) must be rejected. An event at 09:35 (25 min before arrival) must be accepted.

### Tests for User Story 3

- [x] T011 [P] [US3] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — verify that with stop arrival 10:00 / departure 10:30, a geofence ping at 09:25 is not matched (outside 30-min window before arrival), but one at 09:35 is matched — also include boundary case: event at exactly 30 minutes before arrival (should be accepted, boundary is inclusive)
- [x] T012 [P] [US3] Add test in `src/__tests__/tracking/process-device-geofence-events.test.ts` — verify that with stop arrival 10:00 / departure 10:30, a device geofence event at 09:25 is rejected, but one at 09:35 is accepted

### Implementation for User Story 3

- [x] T013 [US3] Fix `src/lib/tracking/infer-stop-progress.ts:199` — change `stopDateTime(entry.departure_time)` to `stopDateTime(entry.arrival_time)` and update the entry type destructuring at line 177 to include `arrival_time` instead of (or in addition to) `departure_time`
- [x] T014 [US3] Fix `src/lib/tracking/process-device-geofence-events.ts:225` — change `stopDateTime(entry.departure_time)` to `stopDateTime(entry.arrival_time)`

**Checkpoint**: Early arrival window correctly anchored to arrival time. Geofence events outside the window are rejected. Tests pass.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Verify all fixes together and run quality gates.

- [x] T015 Run all existing tests (`npx vitest run`) to verify backward compatibility (SC-004 / FR-008)
- [x] T016 Run quality gates: `npx eslint .`, `npx tsc --noEmit`, `npm run build`
- [x] T017 Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: No dependencies on US1 — can start immediately or in parallel
- **User Story 3 (Phase 3)**: No dependencies on US1 or US2 — can start immediately or in parallel
- **Polish (Phase 4)**: Depends on all user stories being complete

### User Story Dependencies

- **US1**: Independent. Touches only `src/lib/time.ts:73` and new test file.
- **US2**: Independent. Touches `src/lib/time.ts:51`, `src/lib/tracking/resolve-route-progress.ts:82,390`, `src/app/api/driver/routes/route.ts:123`, and existing test files.
- **US3**: Independent. Touches `src/lib/tracking/infer-stop-progress.ts:199`, `src/lib/tracking/process-device-geofence-events.ts:225`, and existing test files.

**Note**: US1 and US2 both touch `src/lib/time.ts` but at different lines (73 vs 51) — no conflict. They can be done in parallel.

### Parallel Opportunities

- All 3 user stories can run in parallel (different files or non-overlapping lines).
- Within US2: T003/T004/T005/T009 tests can run in parallel; T006/T007/T008 fixes can run in parallel (different files).
- Within US3: T011/T012 tests can run in parallel; T013/T014 fixes can run in parallel (different files).

---

## Parallel Example: All Stories at Once

```bash
# US1 (src/lib/time.ts:73 + new test file):
Task: "T001 + T002 — fix getNextStop and add test"

# US2 (time.ts:51, resolve-route-progress.ts:82+390, driver/route.ts:123):
Task: "T003-T010 — fix schedule window end in 4 files and add tests"

# US3 (infer-stop-progress.ts:199, process-device-geofence-events.ts:225):
Task: "T011-T014 — fix early arrival gate in 2 files and add tests"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T002 (fix getNextStop + test)
2. Run `npx vitest run` to verify no regressions
3. **STOP and VALIDATE**: Public route pages show correct next stop with distinct dwell times

### Incremental Delivery

1. US1 → test → validates correct "next stop" display (MVP)
2. US2 → test → validates route stays active during dwell
3. US3 → test → validates geofence window precision
4. Polish → full quality gates → ready for PR

### All-at-Once (Recommended for this feature)

Since all 7 fixes are single-field swaps with no interdependencies, the most efficient approach is to apply all fixes in one pass, add all tests, then run quality gates once. Total: 17 tasks, all straightforward.

---

## Notes

- All fixes are single-field name swaps — no logic changes
- No new source files except `src/__tests__/lib/time.test.ts` (test file for `getNextStop` and `isWithinScheduleWindow`)
- Existing tests use identical arrival/departure times — they verify backward compatibility (FR-008)
- New tests use distinct values (15-30 minute dwell) to cover the fixed logic paths (SC-005)
- Fix T013 requires updating the entry type destructuring to include `arrival_time` — see quickstart.md for details
