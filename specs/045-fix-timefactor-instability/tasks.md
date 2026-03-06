# Tasks: Fix timeFactor Instability in ETA Computation

**Input**: Design documents from `/specs/045-fix-timefactor-instability/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Included — unit tests for the new helper function and constants to verify stability guarantees.

**Organization**: Tasks grouped by user story. US1 delivers the core stability fix; US2 adds segment filtering for accuracy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — this is a fix to an existing codebase. Phase 1 is empty.

**Checkpoint**: N/A — proceed to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add constants and the shared helper function that both user stories depend on.

- [x] T001 Add `REFERENCE_SPEED_MPS` (8.3), `MIN_SEGMENT_DIST_M` (100), and `MIN_SEGMENT_TIME_MIN` (0.5) constants to `src/lib/tracking/time-factors.ts`
- [x] T002 Implement `buildRecentRuns()` helper function in `src/lib/tracking/time-factors.ts` that accepts an array of passed stops (with `passedAt`, `stopLat`, `stopLng`) and returns `RecentRun[]`, using `REFERENCE_SPEED_MPS` instead of instantaneous speed, `ROAD_FACTOR` from eta.ts for distance inflation, and filtering segments below `MIN_SEGMENT_DIST_M` or `MIN_SEGMENT_TIME_MIN`
- [x] T003 Add unit tests for `buildRecentRuns()` in `src/lib/tracking/__tests__/time-factors.test.ts` verifying: (a) returns empty array for 0-1 stops, (b) computes stable predictedMinutes using fixed reference speed, (c) filters short-distance segments below MIN_SEGMENT_DIST_M, (d) filters short-time segments below MIN_SEGMENT_TIME_MIN, (e) produces identical output for same input regardless of call order

**Checkpoint**: Foundation ready — `buildRecentRuns()` tested and exported. User story integration can begin.

---

## Phase 3: User Story 1 - Stable ETA Display (Priority: P1) 🎯 MVP

**Goal**: Replace volatile instantaneous-speed-based recentRuns with the stable `buildRecentRuns()` helper in both route endpoints.

**Independent Test**: Observe `timeFactor` in `eta_comparison` logs across consecutive API calls — value should not vary more than 5% when no new stops are passed.

### Implementation for User Story 1

- [x] T004 [P] [US1] Replace inline `recentRuns` loop (lines 204-217) in `src/app/api/routes/[routeId]/route.ts` with a call to `buildRecentRuns(passedStops)`, removing the `vanPosition?.speedMps` dependency and the local `speedMps`/`predictedMinutes` computation
- [x] T005 [P] [US1] Replace inline `recentRuns` loop (lines 196-209) in `src/app/api/routes/route.ts` with a call to `buildRecentRuns(passedStops)`, removing the `vanPosition?.speedMps` dependency and the local `speedMps`/`predictedMinutes` computation
- [x] T006 [US1] Run quality gates: `npx tsc --noEmit`, `npx eslint .`, `npm run build`, `npx vitest`

**Checkpoint**: US1 complete. timeFactor is now stable across consecutive API calls for the same stop set. ETA no longer swings wildly.

---

## Phase 4: User Story 2 - Accurate Traffic Correction (Priority: P2)

**Goal**: Verify and validate that the fixed-reference-speed approach still produces meaningful traffic correction ratios.

**Independent Test**: Compare timeFactor values during congested vs free-flow conditions — factor should be > 1.0 in congestion and < 1.0 in free flow.

### Implementation for User Story 2

- [x] T007 [US2] Add unit tests for `computeRecentFactor()` in the same test file verifying: (a) returns > 1.0 when actual times consistently exceed predicted (congestion), (b) returns < 1.0 when actual times are consistently below predicted (free flow), (c) median correctly smooths mixed-condition segments
- [x] T008 [US2] Verify existing `eta_comparison` log event in `src/lib/tracking/eta.ts` (lines 147-159) still includes `timeFactor` field — no changes needed if already present (FR-006 compliance)

**Checkpoint**: US2 complete. Traffic correction accuracy validated through unit tests.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup.

- [x] T009 Run full quality gates one final time: lint, type-check, build, tests
- [x] T010 Verify no unused imports remain in `src/app/api/routes/[routeId]/route.ts` and `src/app/api/routes/route.ts` after removing inline loop code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1 (Phase 3)**: Depends on Phase 2 (T001-T003 must complete first)
- **US2 (Phase 4)**: Depends on Phase 2 (T001-T003); can run in parallel with US1
- **Polish (Phase 5)**: Depends on Phases 3 and 4

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Foundational phase. No dependency on US2.
- **User Story 2 (P2)**: Depends only on Foundational phase. Can run in parallel with US1.

### Parallel Opportunities

- T004 and T005 can run in parallel (different files, identical change pattern)
- US1 and US2 can run in parallel after Foundational phase completes

---

## Parallel Example: User Story 1

```bash
# After T001-T003 complete, launch both route file changes in parallel:
Task T004: "Replace recentRuns loop in src/app/api/routes/[routeId]/route.ts"
Task T005: "Replace recentRuns loop in src/app/api/routes/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T003)
2. Complete Phase 3: User Story 1 (T004-T006)
3. **STOP and VALIDATE**: Check `timeFactor` stability in logs
4. Deploy to dev

### Incremental Delivery

1. Foundational → `buildRecentRuns()` ready
2. US1 → Stable ETA display (MVP!)
3. US2 → Traffic correction accuracy validated
4. Polish → Final quality gates

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Total: 10 tasks (3 foundational, 3 US1, 2 US2, 2 polish)
- This is a small, focused fix — 3 source files changed, 0 new source files created
- Commit after each phase for clean git history
