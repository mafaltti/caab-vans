# Tasks: Fix Timeline Next-Stop Highlight

**Input**: Design documents from `/specs/035-fix-timeline-next-stop-highlight-when-van-is-late/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Included — the spec requires new test coverage for the late-van scenario (SC-004).

**Organization**: US1 and US2 are both P1 and part of the same code change, so they share a single implementation phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Bug Fix (US1 + US2 — Priority: P1) 🎯 MVP

**Purpose**: Reorder the condition in `deriveTimelineStops` so that the tracking-identified next stop is always highlighted as "current", even when the van is late

**Goal**: The timeline next stop matches the hero card in all timing scenarios

**Independent Test**: Run `npx vitest run src/__tests__/components/schedule-timeline.test.ts` — all tests pass including the new late-van test

### Tests

- [X] T001 [P] [US1] Add test "highlights next stop as current even when van is late (time < serverTime)" to `src/__tests__/components/schedule-timeline.test.ts` — use `inferredNextStopId = "stop-2200"` (time 22:00) with `serverTime = "22:05"` and `passedStopIds = ["caab-0000", "stop-0800", "stop-1600"]`, assert stop-2200 has status "current" (not "past")
- [X] T002 [P] [US2] Add test "GPS-passed stops remain past even when next stop is late" to `src/__tests__/components/schedule-timeline.test.ts` — use same late-van setup, assert passedStopIds entries have status "past" AND inferredNextStopId has status "current"

### Implementation

- [X] T003 [US1] Reorder ternary condition in `deriveTimelineStops` in `src/components/public/schedule-timeline.tsx` (lines 52-58): move `entry.id === inferredNextStopId` check BEFORE `passedSet.has(entry.id) || (serverTime && entry.time < serverTime)` so tracking-identified next stop always gets "current" status

**Checkpoint**: Run `npx vitest run src/__tests__/components/schedule-timeline.test.ts` — T001 and T002 tests now pass, all existing tests still pass

---

## Phase 2: Quality Gates

**Purpose**: Verify no regressions across the full codebase

- [X] T004 Run lint check: `npm run lint`
- [X] T005 [P] Run type check: `npm run typecheck` *(pre-existing failures in apps/van-tracker/ — unrelated)*
- [X] T006 Run full test suite: `npx vitest run`
- [X] T007 Run build: `npm run build` *(pre-existing failures in apps/van-tracker/ — unrelated)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — can start immediately
- **Phase 2**: Depends on Phase 1 completion

### Within Phase 1

- T001 and T002 can run in parallel [P] (both add tests to the same file but different test cases)
- T003 depends on T001 and T002 being written (TDD: tests fail first, then fix)

### Parallel Opportunities

```bash
# Write both tests in parallel:
T001: "Add late-van highlight test"
T002: "Add GPS-passed-stays-past test"

# Quality gates in parallel:
T004: "Lint"
T005: "Type check" [P]
```

---

## Implementation Strategy

### MVP (Phase 1 Only)

1. Write tests T001 + T002 (should FAIL against current code)
2. Apply fix T003 (tests now PASS)
3. Validate: all 7 tests pass (5 existing + 2 new)

### Total

- **Task count**: 7
- **Phase 1 (bug fix + tests)**: 3 tasks
- **Phase 2 (quality gates)**: 4 tasks
- **Parallel opportunities**: T001 ∥ T002, T004 ∥ T005

---

## Notes

- This is a minimal bug fix — one condition reorder in one file + two new test cases
- No data model, API, or UI changes needed
- Commit after Phase 1 with message: `fix(timeline): highlight next stop even when van is late`
