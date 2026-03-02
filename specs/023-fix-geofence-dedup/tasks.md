# Tasks: Fix Geofence Duplicate Stop Passing

**Input**: Design documents from `/specs/023-fix-geofence-dedup/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — the research explicitly calls for unit tests to prevent regression.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Web app (Next.js)**: `src/` at repository root, tests in `src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the shared constant needed by both the fix and the time window guard.

- [X] T001 Add `EARLY_ARRIVAL_WINDOW_MINUTES = 30` constant to `src/lib/time.ts` alongside existing `STALENESS_THRESHOLD_MINUTES`

---

## Phase 2: User Story 1 — Correct Next Stop Display for Round-Trip Routes (Priority: P1) 🎯 MVP

**Goal**: Fix `inferStopProgress()` so that entering the geofence of a repeated stop location marks only the first pending occurrence (by schedule time), with a 30-minute early-arrival time window guard.

**Independent Test**: Send GPS pings near a stop that appears multiple times in the schedule and verify only one occurrence is marked as passed per visit.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T002 [US1] Add unit test: single-occurrence stop is still marked as passed (regression) in `src/__tests__/tracking/infer-stop-progress.test.ts`. Mock Supabase client to return a route with one stop at a given location. Send a ping within geofence. Assert the stop is marked as "passed".
- [X] T003 [P] [US1] Add unit test: repeated stop — only first pending occurrence is marked in `src/__tests__/tracking/infer-stop-progress.test.ts`. Mock a route with CAAB at 07:00, 09:00, 11:00 (same lat/lng). Send a ping within geofence at 07:05. Assert only the 07:00 entry is marked "passed"; 09:00 and 11:00 remain "pending".
- [X] T004 [P] [US1] Add unit test: time window guard — stop >30min in future is skipped in `src/__tests__/tracking/infer-stop-progress.test.ts`. Mock a route where only pending CAAB occurrence is at 09:00. Send a ping within geofence at 07:10 (>30min early). Assert the stop remains "pending".
- [X] T005 [P] [US1] Add unit test: sequential visits — second arrival marks second occurrence in `src/__tests__/tracking/infer-stop-progress.test.ts`. Mock a route with CAAB at 07:00 (already passed) and 09:00 (pending). Send a ping within geofence at 09:03. Assert the 09:00 entry is marked "passed".

### Implementation for User Story 1

- [X] T006 [US1] Modify geofence loop in `src/lib/tracking/infer-stop-progress.ts`: import `EARLY_ARRIVAL_WINDOW_MINUTES`, `parseTime`, and `nowBahia` from `src/lib/time.ts`. In the geofence checking section (step 6), add a `Set<string>` to track matched coordinate keys (`${stopLat},${stopLng}`). Before marking a stop as passed: (a) skip if coordinate key already in Set, (b) skip if `now < parseTime(entry.time).minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES })`. After marking, add coordinate key to Set.
- [X] T007 [US1] Verify all tests from T002–T005 pass after implementation. Run `npm run test -- --reporter=verbose`.

**Checkpoint**: User Story 1 is complete. Repeated stops are correctly deduplicated and time-guarded.

---

## Phase 3: User Story 2 — Accurate ETA After Partial Day Progress (Priority: P2)

**Goal**: Verify that the ETA computation remains accurate when only some occurrences of a repeated stop are marked as passed, and future occurrences still appear as pending with valid ETAs.

**Independent Test**: After marking one occurrence of a repeated stop as passed, verify the next occurrence appears in the pending list and the ETA is GPS-based.

### Tests for User Story 2

- [X] T008 [US2] Add unit test: ETA uses next pending occurrence after partial progress in `src/__tests__/tracking/eta.test.ts`. Create stops where CAAB 07:00 is "passed" and CAAB 09:00 is "pending" with coordinates. Provide a vanPosition. Assert `etaSource` is "gps", `nextStopId` is the 09:00 entry, and `etaNextStopMinutes` is computed from distance/speed.

**Checkpoint**: ETA accuracy is verified for partial-day progress with repeated stops.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation.

- [X] T009 Run lint check: `npm run lint`
- [X] T010 [P] Run type check: `npm run typecheck` (pre-existing errors in apps/van-tracker/ only — not related to this feature)
- [X] T011 Run full test suite: `npm run test`
- [X] T012 Run build: `npm run build` (pre-existing failure in apps/van-tracker/ only — not related to this feature)
- [ ] T013 Manual validation: run `npm run tracking:simulate` and verify via `GET /api/routes` that repeated stops show correct passed/pending status and ETAs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **User Story 1 (Phase 2)**: Depends on T001 (constant)
- **User Story 2 (Phase 3)**: Can start after Phase 1, independent of US1 implementation (tests only)
- **Polish (Phase 4)**: Depends on all previous phases

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 (constant). No dependencies on US2.
- **User Story 2 (P2)**: Depends on T001 (constant). No dependencies on US1 — tests ETA logic independently.

### Within Each User Story

- Tests MUST be written and FAIL before implementation (T002–T005 before T006)
- Implementation (T006) resolves all failing tests
- Verification (T007) confirms all pass

### Parallel Opportunities

- T003, T004, T005 can run in parallel (different test cases, same file but independent describe blocks)
- T009 and T010 can run in parallel (lint and typecheck are independent)
- US1 tests (T002–T005) and US2 test (T008) can run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Write tests in parallel (different test cases):
Task T003: "Unit test: repeated stop dedup in src/__tests__/tracking/infer-stop-progress.test.ts"
Task T004: "Unit test: time window guard in src/__tests__/tracking/infer-stop-progress.test.ts"
Task T005: "Unit test: sequential visits in src/__tests__/tracking/infer-stop-progress.test.ts"

# Then implement the fix:
Task T006: "Modify geofence loop in src/lib/tracking/infer-stop-progress.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Add constant
2. Complete T002–T005: Write failing tests
3. Complete T006: Implement the fix
4. Complete T007: Verify tests pass
5. **STOP and VALIDATE**: All repeated-stop scenarios work correctly

### Incremental Delivery

1. T001 → Setup ready
2. T002–T007 → US1 complete (MVP!) → Core bug is fixed
3. T008 → US2 complete → ETA accuracy verified
4. T009–T013 → Quality gates pass → Ready for PR

---

## Notes

- [P] tasks = different files or independent test cases, no dependencies
- [Story] label maps task to specific user story for traceability
- The fix is scoped to 3 files: `time.ts` (1 constant), `infer-stop-progress.ts` (loop change), test files
- No schema changes, no API contract changes, no frontend changes
- Commit after each logical group (constant, tests, fix, verification)
