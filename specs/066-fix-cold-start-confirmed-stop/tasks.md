# Tasks: Fix Cold-Start Confirmed Stop Stuck Pending

**Input**: Design documents from `/specs/066-fix-cold-start-confirmed-stop/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — existing test file must be updated to validate the new behavior.

**Organization**: US1 and US2 share the same implementation (fixing the endpoint automatically fixes the commuter view), so they are combined into a single phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Implementation — Fix Confirm-Start-Stop Endpoint (US1 + US2, P1)

**Goal**: Include the confirmed stop in the bulk-mark operation and update the idempotency guard so that cold-start confirmation unblocks stop progression.

**Independent Test**: Confirm a mid-route stop and verify `next_stop_id` points to the stop after the confirmed one; verify device geofence events process normally for subsequent stops.

### Implementation

- [x] T001 [US1] Change bulk-mark filter from `seq < confirmedStopSequence` to `seq <= confirmedStopSequence` in `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` (line 163)
- [x] T002 [US1] Update idempotency check (lines 108-129) to detect retry by `targetStop.status === 'passed' && targetStop.pass_source === 'manual'` instead of `run.next_stop_id === stopId` in `src/app/api/routes/[routeId]/confirm-start-stop/route.ts`

**Checkpoint**: Endpoint logic is correct. Confirmed stop is marked passed, next_stop_id points to the stop after.

---

## Phase 2: Tests — Update Existing Test Suite

**Goal**: Update tests to validate new behavior and add edge case coverage.

- [x] T003 [US1] Update happy-path test to expect confirmed stop in passed set (nextStopId shifted by one) in `src/__tests__/lib/tracking/confirm-start-stop.test.ts`
- [x] T004 [US1] Update idempotency tests to use new retry detection logic (target stop passed+manual) in `src/__tests__/lib/tracking/confirm-start-stop.test.ts`
- [x] T005 [P] [US1] Add edge-case test: confirm last stop → all passed, next_stop_id null in `src/__tests__/lib/tracking/confirm-start-stop.test.ts`
- [x] T006 [P] [US1] Add edge-case test: confirm first stop → only it passed, next_stop_id is stop #2 in `src/__tests__/lib/tracking/confirm-start-stop.test.ts`

**Checkpoint**: All tests pass with `npx vitest run src/__tests__/lib/tracking/confirm-start-stop.test.ts`

---

## Phase 3: Quality Gates

**Purpose**: Verify all quality gates pass before PR.

- [x] T007 Run lint, typecheck, build, and full test suite (`npx eslint . && npx tsc --noEmit && npx next build && npx vitest run`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Implementation): No prerequisites — start immediately
- **Phase 2** (Tests): Depends on Phase 1 (T001, T002 must complete first)
- **Phase 3** (Quality Gates): Depends on Phase 2

### Within Phases

- T001 and T002 are in the same file but independent sections — execute sequentially
- T005 and T006 are marked [P] — can run in parallel (independent edge-case tests)

### Parallel Opportunities

```
Phase 2 parallel:
  T005 (last-stop edge case) ‖ T006 (first-stop edge case)
```

---

## Implementation Strategy

### MVP (all tasks — feature is atomic)

1. T001 + T002: Fix the endpoint (2 changes in 1 file)
2. T003 + T004: Update existing tests
3. T005 + T006: Add edge-case tests (parallel)
4. T007: Quality gates
5. **DONE**: Open PR targeting `dev`

This is a single-commit fix. All tasks target 2 files and can be completed in one pass.

---

## Notes

- No new files created
- No database migrations
- No UI changes
- Total: 7 tasks across 2 source files
- The fix is atomic — US1 and US2 are resolved by the same code change
