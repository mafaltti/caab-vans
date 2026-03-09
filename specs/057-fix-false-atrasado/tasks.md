# Tasks: Fix False "Atrasado" (Overdue) Status

**Input**: Design documents from `/specs/057-fix-false-atrasado/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Included — FR-004 in the spec explicitly requires new regression tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Segment fallback false overdue fix (Priority: P1) 🎯 MVP

**Goal**: Prevent the segment fallback ETA path from returning `"overdue"` when the scheduled stop time has not yet passed.

**Independent Test**: Simulate an early van (passed stop ahead of schedule) with segment fallback active and verify `etaStatus` is `"estimated"` while the next stop's scheduled time is in the future.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [US1] Add regression test: segment fallback returns `"estimated"` (not `"overdue"`) when van is early and next stop's scheduled time is in the future, in `src/__tests__/tracking/eta.test.ts`
- [x] T002 [US1] Add regression test: segment fallback returns `"estimated"` when van is on-time and next stop's scheduled time is in the future, in `src/__tests__/tracking/eta.test.ts`
- [x] T003 [US1] Add regression test: segment fallback returns `"overdue"` when both computed ETA and next stop's scheduled time have passed, in `src/__tests__/tracking/eta.test.ts`

### Implementation for User Story 1

- [x] T004 [US1] Add schedule-time guard to segment fallback overdue check (line 279) in `src/lib/tracking/eta.ts` — change `if (etaDateTime <= now)` to `if (etaDateTime <= now && scheduledTime <= now)` using `now.set()`, and clamp `etaNextStopMinutes` with `Math.max(0, ...)`

**Checkpoint**: At this point, segment fallback false positives are eliminated. Tests T001-T003 should pass.

---

## Phase 2: User Story 2 - Schedule fallback guard for consistency (Priority: P2)

**Goal**: Apply the same schedule-time guard to the schedule fallback path for robustness and consistency.

**Independent Test**: Simulate a schedule fallback scenario with negative delay (early van) and verify `etaStatus` is `"estimated"` while the next stop's scheduled time is in the future.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T005 [US2] Add regression test: schedule fallback returns `"estimated"` (not `"overdue"`) when negative delay pushes ETA into the past but next stop's scheduled time is in the future, in `src/__tests__/tracking/eta.test.ts`
- [x] T006 [US2] Add regression test: schedule fallback returns `"overdue"` when both computed ETA and next stop's scheduled time have passed, in `src/__tests__/tracking/eta.test.ts`

### Implementation for User Story 2

- [x] T007 [US2] Add schedule-time guard to schedule fallback overdue check (line 333) in `src/lib/tracking/eta.ts` — change `if (etaDateTime <= now)` to `if (etaDateTime <= now && scheduledTime <= now)` using `now.set()`, and clamp `etaNextStopMinutes` with `Math.max(0, ...)`

**Checkpoint**: Both fallback paths now guard against false overdue. All tests should pass.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Verify no regressions and quality gates pass.

- [x] T008 Run full existing ETA test suite to confirm no regressions in `src/__tests__/tracking/eta.test.ts`
- [x] T009 Run lint (`eslint`), type-check (`tsc --noEmit`), and build (`next build`) quality gates

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Independent of Phase 1 — can run in parallel or sequentially
- **Phase 3 (Polish)**: Depends on Phase 1 and Phase 2 completion

### User Story Dependencies

- **User Story 1 (P1)**: Independent — segment fallback fix
- **User Story 2 (P2)**: Independent — schedule fallback fix (same file, different function)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation is a single-line conditional change

### Parallel Opportunities

- T001, T002, T003 can be written together (same test file, same describe block)
- T005, T006 can be written together (same test file, different describe block)
- US1 and US2 implementation touches different functions in the same file — sequential recommended to avoid merge conflicts

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Write tests T001-T003 → verify they FAIL
2. Apply fix T004 (one conditional change)
3. Verify T001-T003 PASS + existing tests still pass
4. **STOP and VALIDATE**: Run quality gates

### Incremental Delivery

1. Complete US1 (segment fallback fix) → test → commit
2. Complete US2 (schedule fallback fix) → test → commit
3. Run full quality gates (T008, T009)
4. Open PR targeting `dev`

---

## Notes

- Total tasks: 9
- US1: 4 tasks (3 tests + 1 implementation)
- US2: 3 tasks (2 tests + 1 implementation)
- Polish: 2 tasks
- Both implementation tasks modify `src/lib/tracking/eta.ts` (different lines/functions)
- All test tasks modify `src/__tests__/tracking/eta.test.ts` (new test cases appended)
- No new files created
