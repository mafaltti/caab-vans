# Tasks: Gate Stop-Progress Inference by Active Shift

**Input**: Design documents from `/specs/048-gate-stop-inference/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Included — existing test suite must be extended for the new behavior.

**Organization**: Tasks grouped by user story. This is a small, focused fix (2 files changed).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Prevent pre-shift stop marking (Priority: P1)

**Goal**: Add a shift-existence check to `inferStopProgress()` so that stops are not seeded or marked when no active shift exists.

**Independent Test**: Send GPS pings near a stop without starting a shift — no stops should be seeded or marked as "passed."

### Implementation

- [x] T001 [US1] Add active shift check after route_runs upsert in `src/lib/tracking/infer-stop-progress.ts` — query `route_shifts` for `run_id` with `ended_at IS NULL`, limit 1. If no active shift found, return `EMPTY_PROGRESS` immediately. Place this check after the route_runs upsert (line 62) and before the stop count query (line 65). This gates both stop seeding and stop marking. Do NOT gate the route_run upsert itself (FR-003).

### Tests

- [x] T002 [US1] Extend `createMockSupabase()` in `src/__tests__/tracking/infer-stop-progress.test.ts` to support `route_shifts` table queries — add a `shifts` option (array of `{ id, ended_at }`) that the mock returns when `.from("route_shifts")` is called. Default to empty array (no shifts) for backward compatibility with existing tests.

- [x] T003 [US1] Update all existing test cases in `src/__tests__/tracking/infer-stop-progress.test.ts` to pass `shifts: [{ id: "shift-1", ended_at: null }]` to `createMockSupabase()` so they continue to pass (active shift present = existing behavior preserved, FR-004).

- [x] T004 [US1] Add test case "returns EMPTY_PROGRESS when no shifts exist" in `src/__tests__/tracking/infer-stop-progress.test.ts` — call `inferStopProgress` with mock returning empty shifts array, assert result equals `EMPTY_PROGRESS`, assert no stop updates or backfills occurred, assert no stop seeding occurred. This implicitly covers the midnight buffer flush edge case (pings arriving for a new day with no shift).

- [x] T005 [US1] Add test case "returns EMPTY_PROGRESS when all shifts are ended" in `src/__tests__/tracking/infer-stop-progress.test.ts` — call `inferStopProgress` with mock returning `shifts: [{ id: "shift-1", ended_at: "2026-03-07T18:00:00Z" }]`, assert result equals `EMPTY_PROGRESS`.

**Checkpoint**: All existing tests pass with active shift injected. New tests verify the gate blocks stop marking without a shift.

---

## Phase 2: User Story 2 - Correct progress on shift start (Priority: P2)

**Goal**: Verify that when a shift is started and a ping arrives near a mid-route stop, backfill works correctly with no pre-shift phantom passes.

**Independent Test**: Start a shift, send pings near stop 3 — stops 1-3 should be marked passed via backfill.

### Tests

- [x] T006 [US2] Add test case "mid-route start with active shift triggers correct backfill" in `src/__tests__/tracking/infer-stop-progress.test.ts` — set up mock with active shift, van near stop 3 (geofence match), pending stops 1-5. Assert stop 3 marked passed, stops 1-2 backfilled as passed, stops 4-5 remain pending.

**Checkpoint**: Backfill behavior confirmed correct when shift is active. No code change needed — this validates existing behavior is preserved (FR-004).

---

## Phase 3: Polish & Cross-Cutting Concerns

- [x] T007 Run quality gates: `npx eslint src/lib/tracking/infer-stop-progress.ts` and `npx tsc --noEmit` and `npx next build` and `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts`
- [x] T008 Run full test suite: `npx vitest run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — start immediately
  - T001 (implementation) can run in parallel with T002 (mock extension)
  - T003 (update existing tests) depends on T002
  - T004, T005 (new tests) depend on T001 + T002
- **Phase 2 (US2)**: Depends on T001 + T002 completion
  - T006 depends on T001 (shift gate in place) + T002 (mock supports shifts)
- **Phase 3 (Polish)**: Depends on all previous tasks

### Parallel Opportunities

```bash
# These can run in parallel (different files):
Task T001: Implementation in src/lib/tracking/infer-stop-progress.ts
Task T002: Mock extension in src/__tests__/tracking/infer-stop-progress.test.ts

# These run sequentially after T001+T002:
Task T003: Update existing tests (depends on T002)
Task T004: New test - no shifts (depends on T001, T002)
Task T005: New test - ended shifts (depends on T001, T002)
Task T006: New test - mid-route backfill (depends on T001, T002)
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete T001 (shift gate) + T002 (mock extension) in parallel
2. Complete T003 (fix existing tests)
3. Complete T004 + T005 (new gate tests)
4. **STOP and VALIDATE**: Run `npx vitest run` — all tests pass
5. Ready for PR

### Full Delivery

1. Complete US1 (T001–T005)
2. Complete US2 (T006) — validates backfill behavior
3. Run quality gates (T007–T008)
4. Open PR targeting `dev`

---

## Notes

- Total: **8 tasks** across 2 files
- US1: 5 tasks (1 implementation + 4 test tasks)
- US2: 1 task (test-only — validates existing behavior is preserved)
- Polish: 2 tasks (quality gates)
- The implementation change is ~10 lines in a single function
- All existing tests must continue passing (FR-004 regression check)
