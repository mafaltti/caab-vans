# Tasks: Fix Stale GPS Guard Blocking All Pings

**Input**: Design documents from `/specs/043-fix-stale-gps-guard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not requested. No automated test suite exists for the tracker app.

**Organization**: Tasks grouped by user story. US1 (stale guard fix) and US2 (diagnostic reasons) share a foundational change to `diag-log.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Changes)

**Purpose**: Extend `diag-log.ts` with per-reason filter counters and updated `logFiltered()` signature. Both user stories depend on this.

**CRITICAL**: Must complete before US1 or US2 tasks.

- [x] T001 Add `FilterReason` type and extend `MinuteSummary` interface with `flt_acc`, `flt_dup`, `flt_stale` fields in `apps/van-tracker/src/storage/diag-log.ts`
- [x] T002 Update `logFiltered()` to accept a `reason: FilterReason` parameter and increment the corresponding per-reason counter in `apps/van-tracker/src/storage/diag-log.ts`
- [x] T003 Update `ensureCurrentMinute()` to initialize the new fields (`flt_acc: 0`, `flt_dup: 0`, `flt_stale: 0`) in `apps/van-tracker/src/storage/diag-log.ts`
- [x] T004 Update `countOf()` to include `flt_acc + flt_dup + flt_stale` in the sum (or keep existing `flt` since it already tracks total) in `apps/van-tracker/src/storage/diag-log.ts`

**Checkpoint**: `diag-log.ts` compiles with new types and updated function signatures. Existing callers in `task.ts` will have type errors until US1 tasks are complete.

---

## Phase 2: User Story 1 - Tracker Recovers GPS After Cold Start (Priority: P1) MVP

**Goal**: Fix the stale GPS fix guard so the tracker sends pings after cold start instead of silently filtering 100% of GPS callbacks.

**Independent Test**: Kill the tracker app, wait 2+ minutes, relaunch on a stationary device. Verify pings reach the server within 2 minutes.

### Implementation for User Story 1

- [x] T005 [US1] Replace the stale fix guard (lines 261-265) with gap-based relaxation logic: compute `isColdGap` from `lastSentTime`, `isStationary` from `point.speed <= 1`, and use 120s threshold when both are true, else 60s, in `apps/van-tracker/src/location/task.ts`
- [x] T006 [US1] Pass filter reason `"acc"` to `logFiltered()` at the accuracy filter (line 251) in `apps/van-tracker/src/location/task.ts`
- [x] T007 [US1] Pass filter reason `"dup"` to `logFiltered()` at the duplicate timestamp guard (line 257) in `apps/van-tracker/src/location/task.ts`
- [x] T008 [US1] Pass filter reason `"stale"` to `logFiltered()` at the stale fix guard in `apps/van-tracker/src/location/task.ts`

**Checkpoint**: Stale guard fix is functional. Type-check passes. Tracker accepts cached GPS fixes after cold gaps when stationary. Diagnostic reasons are recorded but not yet visible on-screen.

---

## Phase 3: User Story 2 - Diagnostic Log Shows Filter Reasons (Priority: P2)

**Goal**: Show per-reason filter breakdown in the diagnostics screen so operators can diagnose filtering issues on-device.

**Independent Test**: Open the Diagnostics screen on a device that has been tracking. Verify summary rows show per-reason breakdown (e.g., `flt:9 [acc:2 dup:1 st:6]`) and the totals bar includes per-reason counts.

### Implementation for User Story 2

- [x] T009 [US2] Update `MinuteRow` component to display per-reason filter breakdown in the format string (e.g., `flt:9 [acc:2 dup:1 st:6]`) in `apps/van-tracker/app/diagnostics.tsx`
- [x] T010 [US2] Update `SummaryBar` component to aggregate and display per-reason filter totals alongside the existing `Flt` total in `apps/van-tracker/app/diagnostics.tsx`

**Checkpoint**: Diagnostics screen shows per-reason filter breakdown. Both user stories are complete and independently testable.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Verify quality gates pass.

- [x] T011 Run TypeScript type-check (`npx tsc --noEmit`) in `apps/van-tracker/` and fix any errors
- [x] T012 Run ESLint (`npx eslint .`) in `apps/van-tracker/` and fix any warnings/errors
- [x] T013 Verify `countOf()` invariant: `flt === flt_acc + flt_dup + flt_stale` holds by reviewing all increment paths in `apps/van-tracker/src/storage/diag-log.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 completion (needs `logFiltered(reason)` signature)
- **User Story 2 (Phase 3)**: Depends on Phase 1 completion (needs `MinuteSummary` new fields). Can run in parallel with US1.
- **Polish (Phase 4)**: Depends on Phases 2 and 3 completion

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational only. No dependency on US2.
- **User Story 2 (P2)**: Depends on Foundational only. No dependency on US1. Can be implemented in parallel with US1.

### Parallel Opportunities

- T001, T002, T003, T004 are sequential (same file, same interface)
- T005-T008 are sequential (same file, related logic)
- T009, T010 are sequential (same file)
- **US1 (T005-T008) and US2 (T009-T010) can run in parallel** after Phase 1 completes (different files)

---

## Parallel Example: After Phase 1

```text
# These can run in parallel (different files):
Agent A: T005-T008 (task.ts — stale guard fix + filter reasons)
Agent B: T009-T010 (diagnostics.tsx — display format update)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (`diag-log.ts` changes)
2. Complete Phase 2: User Story 1 (`task.ts` stale guard fix)
3. **STOP and VALIDATE**: Deploy to a test device, kill app, wait, relaunch — verify pings arrive
4. This alone fixes the critical bug

### Incremental Delivery

1. Phase 1 (Foundational) → `diag-log.ts` ready
2. Phase 2 (US1) → Stale guard fixed → **Critical bug resolved**
3. Phase 3 (US2) → Diagnostic display updated → **Field diagnosis improved**
4. Phase 4 (Polish) → Quality gates verified → **PR ready**

---

## Notes

- All changes are in `apps/van-tracker/` — no server-side or web app changes
- No new files or dependencies — modifications to 3 existing files only
- Total ~30 lines of code changes across all tasks
- Commit after each phase for clean history
