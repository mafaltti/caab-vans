# Tasks: Fix Timeline Stops Incorrectly Marked as Past When Van Is Late

**Input**: Design documents from `/specs/036-fix-timeline-past-stops/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Included — spec explicitly requires regression test (SC-004).

**Organization**: Tasks grouped by user story. US2 is automatically resolved by the US1 fix (same classification logic feeds both timeline display and "hide previous stops" count).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Correct Timeline When Van Is Late (Priority: P1) MVP

**Goal**: Stops after the current next stop display as "future" (empty circle) even when their scheduled time has passed, by using schedule index as the classification boundary in hybrid mode.

**Independent Test**: View a route where the van is late by 1+ hours; all stops after the highlighted next stop should show empty circles.

### Test for User Story 1

> **NOTE: Write this test FIRST, ensure it FAILS before implementation**

- [x] T001 [US1] Add regression test "stops after current next stop are future even when time < serverTime" in `src/__tests__/components/schedule-timeline.test.ts`. Use a schedule with 5+ stops where `inferredNextStopId` is early (e.g., 2nd stop) and `serverTime` is past several subsequent stops. Assert all stops after `inferredNextStopId` are "future", not "past". Also assert stops before `inferredNextStopId` remain "past" (by schedule order).

### Implementation for User Story 1

- [x] T002 [US1] Fix `deriveTimelineStops()` hybrid mode (lines 50–60) in `src/components/public/schedule-timeline.tsx`. In the `if (passedStopIds && passedStopIds.length > 0)` block: (1) find `inferredNextStopId` index in schedule array, (2) if found: classify stops before index as "past", stop at index as "current", stops after as "future", GPS-confirmed always "past", (3) if not found: preserve existing time-based fallback as last resort. Do NOT change any other code path (waiting/completed/not-running/fallback modes).

### Verification for User Story 1

- [x] T003 [US1] Run existing test suite to verify zero regressions: `npx vitest run src/__tests__/components/schedule-timeline.test.ts`. All 6 existing tests + new regression test must pass.

**Checkpoint**: Timeline classification is correct for late vans. US2 (hide previous stops count) is automatically fixed since it derives from the same `deriveTimelineStops()` output.

---

## Phase 2: Polish & Quality Gates

**Purpose**: Verify build integrity and prepare for PR

- [x] T004 Run type check: `npx tsc --noEmit`
- [x] T005 [P] Run lint: `npx eslint src/components/public/schedule-timeline.tsx src/__tests__/components/schedule-timeline.test.ts`
- [x] T006 Run build: `npx next build` (pre-existing failure in apps/van-tracker — unrelated to this change)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No prerequisites — can start immediately
- **Phase 2 (Polish)**: Depends on Phase 1 completion

### Within User Story 1

- T001 (test) → must FAIL before T002
- T002 (fix) → T001 should now PASS
- T003 (verify) → depends on T002

### User Story Dependencies

- **US1 (P1)**: No dependencies — this is the entire fix
- **US2 (P2)**: Automatically resolved by US1 — the "hide previous stops" count reads from `stops.filter(s => s.status === "past")`, which is corrected by the same classification fix. No additional code changes needed.

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Write failing regression test (T001)
2. Fix `deriveTimelineStops()` (T002)
3. Verify all tests pass (T003)
4. Run quality gates (T004–T006)
5. **DONE** — US2 is resolved as a side effect

### Execution Order (Sequential)

```
T001 → T002 → T003 → T004 + T005 (parallel) → T006
```

---

## Notes

- Total: 6 tasks (3 implementation + 3 quality gates)
- US1: 3 tasks (test, fix, verify)
- US2: 0 additional tasks (resolved by US1 fix)
- Parallel opportunities: T004 + T005 can run in parallel
- All changes are in 2 existing files — no new files created
- Commit after T003 (fix + test together as one atomic commit)
