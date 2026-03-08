# Tasks: Progress Pointer Cutover

**Input**: Design documents from `/specs/052-progress-pointer-cutover/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Included — the spec explicitly requires new test coverage (spec §5, FR-001 through FR-013).

**Organization**: Tasks grouped by user story. US2 and US3 are foundational (must complete before US4). US4 is the core implementation. US1, US5, US6 build on US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Environment configuration for the new rollout flag

- [X] T001 Add `TRACKING_PROGRESS_SOURCE` env var documentation to `specs/052-progress-pointer-cutover/quickstart.md` and add to `.env.local` with default value `legacy`
- [X] T002 Add `POINTER_STALENESS_MINUTES` constant (30) to `src/lib/time.ts`, alongside existing `STALENESS_THRESHOLD_MINUTES`

---

## Phase 2: Foundational — Write Path Hardening + ETA Explicit Target (US2 + US3)

**Purpose**: Both US2 and US3 are independent prerequisites that MUST complete before the shared resolver (US4) can be built. They can be implemented in parallel since they modify different files.

**⚠️ CRITICAL**: No US4 work can begin until US3 is complete (resolver needs `targetStopId` in `computeEta`).

### US2 — Reliable Write Path (Priority: P1)

**Goal**: Capture and log errors from all unchecked write operations in `infer-stop-progress.ts`.

**Independent Test**: Simulate a pointer write failure. Verify structured error log is emitted with run ID, route ID, service date, and chosen pointer values.

- [X] T003 [US2] Add error capture to all three unchecked writes in `src/lib/tracking/infer-stop-progress.ts` — for each of: (1) geofence mark (line ~266), (2) backfill mark (line ~321), (3) pointer persist (line ~378), destructure `{ error }` from the Supabase `.update()` call and log with structured context if error is non-null. Follow the existing seed error pattern at line ~115. Context fields: runId, routeId, serviceDate (pointer only), scheduleEntryId or backfillIds (as applicable), error message.
- [X] T004 [US2] Add tests for write error logging in `src/__tests__/tracking/infer-stop-progress.test.ts` — add test cases that mock Supabase `.update()` to return an error for each of the three writes (geofence mark, backfill mark, pointer persist) and assert `console.error` is called with the expected structured context fields.

**Checkpoint**: All three write operations now capture and log errors. Existing tests still pass.

### US3 — ETA Explicit Target (Priority: P1)

**Goal**: Make `computeEta` accept an optional `targetStopId` parameter. When provided, compute ETA for that exact stop instead of using internal time-floor selection.

**Independent Test**: Call `computeEta` with a `targetStopId` pointing to an overdue pending stop. Verify the returned `nextStopId` matches the explicit target, not the time-based selection.

- [X] T005 [P] [US3] Add optional `targetStopId?: string` parameter to the `computeEta` function signature in `src/lib/tracking/eta.ts`. When provided and found in the pending stops array, use that stop as `nextStop` instead of `sortedPending[0]`. When not found in pending stops, return null ETA result. When not provided, fall back to existing time-floor selection (lines ~64-89). Keep all downstream GPS/OSRM/segment/schedule branches unchanged — they already use the generic `nextStop` variable.
- [X] T006 [US3] Add explicit-target test cases to `src/__tests__/tracking/eta.test.ts` — add a new `describe("explicit targetStopId")` block with these cases: (1) target is a valid pending stop → ETA computed for that stop, `nextStopId` matches; (2) target is overdue but still pending → valid ETA returned; (3) target differs from time-based selection → target wins; (4) target not found in pending stops → null ETA returned; (5) target is provided but all stops are passed → null ETA returned; (6) no target provided → legacy time-floor selection used (backward compat); (7) stale GPS + explicit target → segment/schedule fallback still targets the explicit stop; (8) target stop has a non-null `stop_group_id` → ETA computed normally for that specific entry, grouping has no effect on resolution.

**Checkpoint**: `computeEta` accepts explicit targets. All 91 existing tests + new tests pass.

---

## Phase 3: User Story 4 — Unified Progress Resolution (Priority: P2) 🎯 MVP

**Goal**: Extract duplicated progress assembly from both route handlers into a single shared resolver at `src/lib/tracking/resolve-route-progress.ts`. This resolver reads `route_runs`, validates the persisted pointer, calls `computeEta` with the explicit target, and returns one canonical progress object.

**Independent Test**: Call both route list and route detail endpoints for the same active route. Both must return identical `nextStopId`, `etaNextStopMinutes`, `delayMinutes`, and `runStatus`.

**Depends on**: US3 (T005 — `computeEta` must accept `targetStopId`)

- [X] T007 [US4] Create `src/lib/tracking/resolve-route-progress.ts` with the `resolveRouteProgress()` function. It must: (1) accept routeId, serviceDate, sortedEntries, van position, now, osrmBaseUrl, and supabase client; (2) query `route_runs` for the service date to get `next_stop_id`, `last_passed_stop_id`, `progress_updated_at`; (3) query `route_shifts` and call `deriveRunStatus`; (4) return early with null progress for completed and idle runs (FR-011); (5) query `route_run_stops` with schedule entry joins; (6) build `recentSpeeds` from `van_location_pings`; (7) validate persisted pointer: check existence in schedule entries array, check entry is pending, check `progress_updated_at` age < 30 minutes (`POINTER_STALENESS_MINUTES` from T002); (8) call `computeEta` with validated `targetStopId` (or undefined for legacy fallback); (9) return canonical `RouteProgress` object. Extract logic from `src/app/api/routes/route.ts` lines ~132-256 and `src/app/api/routes/[routeId]/route.ts` lines ~140-265.
- [X] T008 [US4] Refactor `src/app/api/routes/route.ts` — replace the inline progress assembly block (lines ~132-287) with a call to `resolveRouteProgress()`. Keep route-list-specific logic (fetching multiple routes, formatting response array) in the handler. The `nextStop` override via `resolveNextStop` should use the `nextStopId` from the resolver's returned progress.
- [X] T009 [US4] Refactor `src/app/api/routes/[routeId]/route.ts` — replace the inline progress assembly block (lines ~140-296) with a call to `resolveRouteProgress()`. Keep route-detail-specific logic (single route fetch, schedule array in response) in the handler. The `nextStop` override via `resolveNextStop` should use the `nextStopId` from the resolver's returned progress.
- [X] T010 [US4] Create `src/__tests__/tracking/resolve-route-progress.test.ts` with unit tests for the shared resolver. Mock Supabase calls (following patterns from `infer-stop-progress.test.ts`). Test cases: (1) active run with valid pointer → returns progress with pointer's nextStopId; (2) active run with missing pointer (null) → falls back to legacy ETA selection; (3) active run with stale pointer (progress_updated_at > 30 min ago) → falls back to legacy; (4) active run with invalid pointer (ID not in schedule entries) → falls back to legacy; (5) completed run with pointer set → returns null nextStopId, null ETA; (6) idle run → returns null nextStopId, null ETA, pointer retained internally; (7) waiting run (no shifts) → returns waiting status, null nextStopId; (8) no route_run exists for service date → returns null; (9) pointer references deleted entry (not found in entries array) → falls back to legacy.
- [X] T011 [US4] Update `src/__tests__/tracking/routes-api.test.ts` — add or update tests to verify both handlers produce identical progress for the same route. Test that `deriveRouteFields` still works correctly with the resolver's output.

**Checkpoint**: Both route handlers use the shared resolver. All existing + new tests pass. `pnpm tsc --noEmit && pnpm vitest run` succeeds.

---

## Phase 4: User Story 1 — Consistent Next-Stop and ETA Display (Priority: P1)

**Goal**: Verify and enforce the consistency invariant: `nextStop.id === progress.nextStopId` across all UI surfaces. This story is the *outcome* of US3 + US4 — implementation is in the resolver, this phase adds integration verification and UI regression tests.

**Independent Test**: Load route detail page for a late route. Verify hero card, timeline, and ETA all reference the same stop.

**Depends on**: US4 (T007-T009 — resolver must be in place)

- [X] T012 [P] [US1] Create `src/__tests__/components/route-card-eta.test.ts` — UI regression tests for `src/components/public/route-card.tsx`. Test cases: (1) when `route.nextStop.id === route.progress.nextStopId` and `etaNextStopMinutes` is non-null → ETA badge is rendered; (2) when `nextStop.id !== progress.nextStopId` → ETA badge is NOT rendered; (3) when `etaNextStopMinutes` is null → ETA badge is NOT rendered; (4) when `progress` is null → ETA badge is NOT rendered.
- [X] T013 [P] [US1] Create `src/__tests__/components/route-detail-eta.test.ts` — UI regression tests for ETA gating in `src/app/(public)/routes/[routeId]/page.tsx`. Test the `etaMinutes` derivation: (1) when `nextStop.id === progress.nextStopId` → `etaMinutes` equals `progress.etaNextStopMinutes`; (2) when IDs differ → `etaMinutes` is null; (3) completed run → no ETA shown.
- [X] T014 [US1] Add end-to-end consistency assertion in `src/__tests__/tracking/resolve-route-progress.test.ts` — add a test that verifies the resolver's returned `nextStopId` matches what `resolveNextStop()` would produce when given the same entries and the resolver's `nextStopId`. This closes the loop between the two functions.

**Checkpoint**: UI regression tests confirm the gating logic. Consistency invariant is verified by unit tests.

---

## Phase 5: User Story 5 — Shadow Mode for Safe Rollout (Priority: P2)

**Goal**: Implement the three-mode progress source flag (`legacy|shadow|persisted`) in the shared resolver. In shadow mode, compute both legacy and persisted results, serve legacy, and log mismatches.

**Independent Test**: Set `TRACKING_PROGRESS_SOURCE=shadow`. Load a route where the persisted pointer differs from time-based selection. Verify legacy result is served and a mismatch log is emitted.

**Depends on**: US4 (T007 — resolver must exist)

- [X] T015 [US5] Add progress source mode parsing to `src/lib/tracking/resolve-route-progress.ts` — read `process.env.TRACKING_PROGRESS_SOURCE`, validate it is one of `legacy|shadow|persisted` (default to `legacy` if missing or invalid). Use a simple string check consistent with the `DEBUG_ETA` pattern in `eta.ts`.
- [X] T016 [US5] Implement shadow mode logic in the resolver in `src/lib/tracking/resolve-route-progress.ts` — when mode is `shadow`: (1) compute legacy result (call `computeEta` without targetStopId); (2) compute persisted result (call `computeEta` with validated targetStopId); (3) compare `nextStopId` values; (4) if different, emit structured log with `routeId`, `runId`, `runStatus`, legacy `nextStopId`, persisted `nextStopId`, `etaSource`, and mismatch reason; (5) return the legacy result to the caller.
- [X] T017 [US5] Implement persisted mode logic in the resolver in `src/lib/tracking/resolve-route-progress.ts` — when mode is `persisted`: use the validated pointer as `targetStopId` for `computeEta`. If pointer is MISSING/INVALID/STALE, fall back to legacy (no targetStopId) and log the fallback reason. When mode is `legacy`: call `computeEta` without targetStopId (current behavior, no change needed).
- [X] T018 [US5] Add shadow mode tests in `src/__tests__/tracking/resolve-route-progress.test.ts` — test cases: (1) `legacy` mode → ETA called without targetStopId, no shadow log; (2) `shadow` mode, pointers match → no mismatch log emitted; (3) `shadow` mode, pointers differ → structured mismatch log emitted with all required fields; (4) `persisted` mode, valid pointer → ETA called with targetStopId; (5) `persisted` mode, stale pointer → falls back to legacy, log emitted; (6) `persisted` mode, missing pointer → falls back to legacy; (7) invalid env var value → defaults to `legacy`.

**Checkpoint**: All three modes work correctly. Shadow mode logs mismatches. Persisted mode uses validated pointer with legacy fallback.

---

## Phase 6: User Story 6 — Completed Runs Show No Active Progress (Priority: P3)

**Goal**: Ensure completed and idle runs return no next stop and no ETA, regardless of persisted pointer state.

**Independent Test**: Complete a route run while a persisted pointer exists. Load the route. Verify `nextStopId` is null and no ETA is displayed.

**Depends on**: US4 (T007 — resolver handles run status)

- [X] T019 [US6] Verify idle pointer suppression and add re-activation test in `src/lib/tracking/resolve-route-progress.ts` and `src/__tests__/tracking/resolve-route-progress.test.ts` — confirm the resolver does NOT surface the pointer in the returned progress during idle state (pointer retained in DB but not in response). Add test cases: (1) idle run with persisted pointer → progress has `nextStopId: null`, pointer is NOT cleared from DB; (2) idle run transitions to in_progress (new shift starts) → pointer re-activates, ETA computed for that pointer's stop. Note: completed/waiting cases are already covered by T010 items 5/7/8.

**Checkpoint**: All run states handled correctly. No stale progress shown for inactive runs.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates, quality gates, and final validation

- [X] T020 [P] Update `docs/execution/0080-tracking-final-summary.md` to accurately reflect the pointer cutover implementation status — remove or correct statements that overstate the current implementation per spec §Post-Cutover Documentation.
- [X] T021 [P] Run full quality gate validation: `pnpm eslint . && pnpm tsc --noEmit && pnpm next build && pnpm vitest run` — fix any lint, type, build, or test failures.
- [X] T022 Verify shadow validation scenarios can be exercised — confirm the 7 shadow validation scenarios from spec §Shadow Validation Scenarios are testable with the current implementation: (1) route on time, (2) all remaining stops overdue, (3) stale GPS + active shift, (4) grouped stops, (5) idle break, (6) completed run, (7) missing pointer.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T002 constant needed). US2 and US3 are independent of each other and CAN run in parallel.
- **US4 (Phase 3)**: Depends on US3 (T005 — `computeEta` must accept `targetStopId`). Does NOT depend on US2 (write path hardening is independent).
- **US1 (Phase 4)**: Depends on US4 (T007-T009 — resolver must be in place)
- **US5 (Phase 5)**: Depends on US4 (T007 — shadow/persisted logic lives in the resolver)
- **US6 (Phase 6)**: Depends on US4 (T007 — completed/idle handling is in the resolver)
- **Polish (Phase 7)**: Depends on all previous phases

### User Story Dependencies

```
US2 (write path) ──────────────────────────────────┐
                                                     ├──→ Phase 7 (polish)
US3 (ETA target) ──→ US4 (resolver) ──┬──→ US1 ────┤
                                       ├──→ US5 ────┤
                                       └──→ US6 ────┘
```

- **US2**: Independent. Can start immediately after Phase 1.
- **US3**: Independent. Can start immediately after Phase 1. **Parallel with US2.**
- **US4**: Requires US3. Core implementation phase.
- **US1, US5, US6**: All require US4. Can run in parallel after US4 completes.

### Within Each User Story

- Tests can be written alongside or after implementation (no strict TDD requirement)
- Resolver creation (T007) before handler refactoring (T008, T009)
- Handler refactors (T008, T009) can run in parallel (different files)

### Parallel Opportunities

```
Phase 2 (parallel):
  T003 (US2 — all write fixes in infer-stop-progress.ts)
  T005 (US3 — different file: eta.ts)

Phase 3 (sequential then parallel):
  T007 (create resolver) → T008 + T009 (parallel: refactor two handlers)

Phase 4 + 5 + 6 (parallel after Phase 3):
  T012 + T013 (US1 — parallel: two UI test files)
  T015 → T016 + T017 (US5 — sequential: parse → implement modes)
  T019 (US6 — idle suppression + re-activation tests)
```

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch US2 and US3 in parallel (different files):
Task T003: "Add error capture to all writes in src/lib/tracking/infer-stop-progress.ts"
Task T005: "Add targetStopId parameter to computeEta in src/lib/tracking/eta.ts"
```

## Parallel Example: After Phase 3 Completes

```bash
# Launch US1, US5, US6 in parallel (all different files):
Task T012: "Create route-card-eta.test.ts"
Task T013: "Create route-detail-eta.test.ts"
Task T018: "Add shadow mode tests in resolve-route-progress.test.ts"
Task T019: "Idle suppression + re-activation tests"
```

---

## Implementation Strategy

### MVP First (US3 + US4 = Core Cutover)

1. Complete Phase 1: Setup (env var + constant)
2. Complete US3: ETA accepts explicit target
3. Complete US4: Shared resolver replaces duplicated handlers
4. **STOP and VALIDATE**: Both endpoints return identical progress. All existing tests pass.
5. Deploy with `TRACKING_PROGRESS_SOURCE=legacy` (zero behavior change)

### Incremental Delivery

1. Setup + US2 + US3 → Foundational ready (write path safe, ETA accepts targets)
2. US4 → Resolver live → Deploy as `legacy` (MVP!)
3. US5 → Shadow mode → Deploy as `shadow` in staging → Validate 7 scenarios
4. US1 + US6 → UI regression tests + edge case coverage → Confidence for cutover
5. Switch to `persisted` → Monitor → Cutover complete

### Single Developer Strategy

1. Phase 1 → Phase 2 (US2 + US3 sequentially) → Phase 3 (US4) → test + deploy as legacy
2. Phase 5 (US5) → deploy as shadow → validate
3. Phase 4 (US1) + Phase 6 (US6) → add test coverage
4. Phase 7 (polish) → switch to persisted

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 modifies `infer-stop-progress.ts` (write path); US3 modifies `eta.ts` (ETA) — no file conflicts, parallelizable
- US4 creates a new file (`resolve-route-progress.ts`) then modifies two handlers — sequential within phase
- T003 consolidates all three write error captures into one task (same file, same pattern)
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- No database migrations needed — all columns exist from migration 00013
