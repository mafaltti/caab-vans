# Tasks: Fix ETA Segment Distance After Stop Skip

**Input**: Design documents from `/specs/073-fix-eta-segment-skip/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included — both bugs require test coverage to verify correctness and prevent regression.

**Organization**: Tasks grouped by user story. Both stories are P1 but touch different code paths.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Type Change)

**Purpose**: Expand the Stop type to accept skipped stops — prerequisite for both user stories.

- [x] T001 Expand `Stop.status` type union from `"pending" | "passed"` to `"pending" | "passed" | "skipped"` in `src/lib/tracking/eta.ts` (line 14)

**Checkpoint**: Type change compiles. No behavior change yet — existing tests still pass.

---

## Phase 2: User Story 1 - Accurate ETA When Stops Are Skipped (Priority: P1) 🎯 MVP

**Goal**: Segment-based ETA uses correct cumulative distance when intermediate stops are skipped.

**Independent Test**: Create a route with a skipped stop between last-passed and target. Verify segment ETA uses the sum of distances through the skipped stop, not just the first segment.

### Implementation for User Story 1

- [x] T002 [US1] Remove `.filter((rs) => rs.status !== "skipped")` and update status type cast from `"pending" | "passed"` to `"pending" | "passed" | "skipped"` in `src/lib/tracking/resolve-route-progress.ts` (line 293-294, line 307)

### Tests for User Story 1

- [x] T003 [US1] Add test: single skipped stop between last-passed and target — segment distance sums through skipped stop (e.g., dist #13→#14 + dist #14→#15) in `src/__tests__/tracking/eta.test.ts`
- [x] T004 [US1] Add test: multiple consecutive skipped stops — distances accumulate correctly across all gaps in `src/__tests__/tracking/eta.test.ts`
- [x] T005 [US1] Add test: no skipped stops — behavior unchanged, regression guard (verify existing multi-segment tests still pass) in `src/__tests__/tracking/eta.test.ts`

**Checkpoint**: Segment ETA calculates correct distances for all skip patterns. Existing tests still pass.

---

## Phase 3: User Story 2 - Graceful Handling of Past-Due Segment ETA (Priority: P1)

**Goal**: When segment ETA falls in the past but scheduled time is still future, fall back to schedule-based ETA instead of clamping to 0 min.

**Independent Test**: Simulate segment ETA in the past with a future scheduled time. Verify the result uses schedule fallback (etaSource: "schedule") instead of returning 0 min with etaSource: "segment".

### Implementation for User Story 2

- [x] T006 [US2] Add `else if (etaDateTime <= now)` branch after the overdue guard (line 302) in `src/lib/tracking/eta.ts` to call `scheduleDelayFallback()` when segment ETA is past but scheduled time is future

### Tests for User Story 2

- [x] T007 [US2] Add test: segment ETA in past + scheduled time in future → returns schedule fallback (etaSource: "schedule"), not 0 min estimated in `src/__tests__/tracking/eta.test.ts`
- [x] T008 [US2] Add test: both segment ETA and scheduled time in past → returns overdue (existing behavior preserved) in `src/__tests__/tracking/eta.test.ts`
- [x] T009 [US2] Add test: segment ETA in future → returns segment ETA as-is (existing behavior preserved) in `src/__tests__/tracking/eta.test.ts`

**Checkpoint**: Past-due segment ETA falls back to schedule. Overdue and normal cases unchanged.

---

## Phase 4: Polish & Verification

**Purpose**: Validate both fixes together and run quality gates.

- [x] T010 Run full ETA test suite: `npx vitest run src/__tests__/tracking/eta.test.ts`
- [x] T011 Run quality gates: `npx eslint src/lib/tracking/eta.ts src/lib/tracking/resolve-route-progress.ts && npx tsc --noEmit`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on T001 (type change)
- **US2 (Phase 3)**: Depends on T001 (type change). Independent from US1 — can run in parallel
- **Polish (Phase 4)**: Depends on all implementation and test tasks complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 only. No dependency on US2.
- **User Story 2 (P1)**: Depends on T001 only. No dependency on US1.

### Within Each User Story

- Implementation before tests (tests verify the fix works)
- Tests can be written alongside implementation since they target the same file

### Parallel Opportunities

- T003, T004, T005 (US1 tests) can run in parallel after T002
- T007, T008, T009 (US2 tests) can run in parallel after T006
- US1 (T002-T005) and US2 (T006-T009) can run in parallel after T001

---

## Parallel Example: After T001

```bash
# US1 and US2 implementation can start in parallel:
Task T002: "Remove skipped-stop filter in resolve-route-progress.ts"
Task T006: "Add schedule fallback branch in eta.ts"

# Then their tests in parallel:
Task T003: "Test single skipped stop segment distance"
Task T004: "Test consecutive skipped stops"
Task T007: "Test past-due segment ETA schedule fallback"
Task T008: "Test both-past overdue behavior"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Type change (foundational)
2. Complete T002: Remove filter (US1 fix)
3. Complete T003-T005: Verify fix with tests
4. **STOP and VALIDATE**: Segment distances are now correct for skipped stops
5. This alone fixes the root cause of the reported bug

### Full Fix (Both Stories)

1. T001 → T002 + T006 in parallel → T003-T005 + T007-T009 in parallel → T010-T011
2. Total: 11 tasks, 2 source files modified, 1 test file extended

---

## Notes

- Both user stories are P1 but independent — US1 fixes the distance, US2 fixes the display clamping
- US2 can occur without US1 (e.g., traffic delay causes stale segment ETA even without skips)
- The type change (T001) is trivially small but is a logical prerequisite for both stories
- Existing multi-segment tests (T002-T005 in the current test file) serve as regression guards for FR-006
