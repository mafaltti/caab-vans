# Tasks: Fix Stop Progress Backfill

**Input**: Design documents from `/specs/031-fix-stop-backfill/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included — SC-003 requires new tests covering backfill and closest-in-time scenarios.

**Organization**: Tasks grouped by user story. US2 (closest-in-time) is implemented before US1 (backfill) because the step 6 rewrite is a prerequisite for the backfill step 6b.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Test Infrastructure)

**Purpose**: Extend the existing test mock to support the new `.in()` query pattern needed by backfill

- [X] T001 Extend `createMockSupabase` to track `.in("schedule_entry_id", ids)` calls on `route_run_stops.update()`, storing backfilled IDs in a separate `mock._backfills` array in `src/__tests__/tracking/infer-stop-progress.test.ts`

---

## Phase 2: User Story 2 - Correct Matching for Repeated Stops (Priority: P1) 🎯 MVP

**Goal**: When multiple pending stops share the same coordinates, match the geofence hit to the occurrence whose scheduled time is closest to `now` (smallest `|time - now|`), not the earliest.

**Independent Test**: Simulate a GPS ping at CAAB at 11:05 with both 07:00 and 11:00 pending — verify only 11:00 is geofence-matched.

### Tests for User Story 2

- [X] T002 [P] [US2] Write test: "matches closest-in-time occurrence when repeated stop has multiple pending entries" — at 11:05, CAAB 07:00+11:00 pending, expect 11:00 matched in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T003 [P] [US2] Write test: "matches early occurrence when current time is near it" — at 07:05, CAAB 07:00+11:00 pending, expect 07:00 matched in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T004 [P] [US2] Write test: "three occurrences picks middle when closest to now" — at 11:10, CAAB 07:00+11:00+15:00 pending, expect 11:00 matched in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 2

- [X] T005 [US2] Rewrite step 6 (geofence loop) in `src/lib/tracking/infer-stop-progress.ts`: replace linear iteration + `matchedCoords` dedup with coordinate grouping → early arrival filter → geofence check per group → pick stop with smallest `|parseTime(time) - now|` → mark as passed
- [X] T006 [US2] Verify all 4 existing tests plus new US2 tests pass by running `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Repeated stops are correctly matched by closest-in-time. Existing single-stop and early-arrival behavior preserved.

---

## Phase 3: User Story 1 - Accurate Stop Progress When Tracking Starts Late (Priority: P1)

**Goal**: After any geofence match, automatically backfill all chronologically earlier pending stops as "passed" in a single batch query.

**Independent Test**: Simulate first GPS ping at stop 10 of 15 — verify stops 1–10 are all marked as passed.

### Tests for User Story 1

- [X] T007 [P] [US1] Write test: "backfills all earlier pending stops when mid-route stop is matched" — van at stop 10, stops 1–9 pending, expect all 1–9 backfilled in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T008 [P] [US1] Write test: "backfills partially — only pending stops before matched stop" — stops 1–5 already passed, van matches stop 8, expect 6–7 backfilled in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T009 [P] [US1] Write test: "no backfill when first stop is matched" — van at stop 1, expect only stop 1 marked, no backfill in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] Add step 6b (chronological backfill) in `src/lib/tracking/infer-stop-progress.ts`: after geofence matches, find max time among newly-passed stops, collect IDs of pending stops with `time < maxPassedTime` (excluding already-matched), batch update via `.in("schedule_entry_id", ids)`
- [X] T011 [US1] Verify all existing + US2 + US1 tests pass by running `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Mid-route tracking start produces a fully accurate timeline. All earlier stops backfilled.

---

## Phase 4: User Story 3 - Backfilled Stops Record Timestamp (Priority: P2)

**Goal**: Verify that backfilled stops have `passed_at` set to the current time (not their scheduled time or null).

**Independent Test**: Trigger a backfill and assert all backfilled entries have non-null `passed_at`.

### Tests for User Story 3

- [X] T012 [US3] Write test: "backfilled stops have passed_at set to current time" — verify the `.update()` payload for backfill includes `passed_at` with current timestamp in `src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Implementation already done in T010 (the `.update()` call includes `passed_at: now`). This phase only adds verification.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Edge case coverage and quality gate validation

### Edge Case Tests

- [X] T013 [P] Write test: "van at last stop marks all stops as passed, nextStopId is null" in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T014 [P] Write test: "no geofence match triggers no backfill" — van between stops, expect no updates in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T015 [P] Write test: "early arrival window prevents matching future stop even with closest-in-time logic" in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T016 [P] Write test: "all stops already passed returns existing state with no updates" in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Quality Gates

- [X] T017 Run all quality gates: `npx vitest run` + `npx tsc --noEmit` + `npx next build` + `npx eslint src/lib/tracking/infer-stop-progress.ts src/__tests__/tracking/infer-stop-progress.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — mock extension first
- **US2 (Phase 2)**: Depends on T001 (mock) — step 6 rewrite
- **US1 (Phase 3)**: Depends on T005 (step 6 rewrite) — step 6b builds on new step 6
- **US3 (Phase 4)**: Depends on T010 (backfill implementation) — verification only
- **Polish (Phase 5)**: Depends on all user stories complete

### Task Dependencies

```
T001 (mock extension)
 ├── T002, T003, T004 (US2 tests) [parallel]
 │   └── T005 (step 6 rewrite)
 │       └── T006 (verify US2)
 │           ├── T007, T008, T009 (US1 tests) [parallel]
 │           │   └── T010 (step 6b backfill)
 │           │       └── T011 (verify US1)
 │           │           └── T012 (US3 test)
 │           │               ├── T013, T014, T015, T016 (edge cases) [parallel]
 │           │               └── T017 (quality gates)
```

### Parallel Opportunities

- T002, T003, T004 can run in parallel (different test cases, same file but no conflicts)
- T007, T008, T009 can run in parallel (different test cases)
- T013, T014, T015, T016 can run in parallel (different edge case tests)

---

## Parallel Example: User Story 2 Tests

```bash
# Write all US2 tests in parallel:
Task: "T002 - closest-in-time test (11:05 → match 11:00)"
Task: "T003 - early occurrence test (07:05 → match 07:00)"
Task: "T004 - triple occurrence test (11:10 → match 11:00)"
```

---

## Implementation Strategy

### MVP First (User Story 2 → User Story 1)

1. Complete Phase 1: Mock extension (T001)
2. Complete Phase 2: Closest-in-time matching (T002–T006)
3. **VALIDATE**: Run tests — US2 should pass independently
4. Complete Phase 3: Backfill (T007–T011)
5. **VALIDATE**: Run tests — both US1 and US2 should pass
6. Complete Phase 4–5: Verification + edge cases + quality gates

### Why US2 Before US1

US2 (closest-in-time) rewrites step 6 of `inferStopProgress`. US1 (backfill) adds step 6b which depends on the output of the rewritten step 6. Implementing US2 first avoids rewriting step 6 twice.

---

## Notes

- All changes are in 2 files: `src/lib/tracking/infer-stop-progress.ts` and `src/__tests__/tracking/infer-stop-progress.test.ts`
- No migration, no new files, no API changes
- Commit after each phase checkpoint
- The `_backfills` mock array (T001) separates geofence-matched updates from batch backfill updates for clearer test assertions
