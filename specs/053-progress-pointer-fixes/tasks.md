# Tasks: Progress Pointer Correctness Fixes

**Input**: Design documents from `/specs/053-progress-pointer-fixes/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — SC-005 requires new tests for each corrected behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Constant)

**Purpose**: Add the new staleness ceiling constant used by US3.

- [x] T001 Add `POINTER_ABSOLUTE_CEILING_MINUTES = 120` constant to `src/lib/time.ts`

**Checkpoint**: New constant exported and available for import.

---

## Phase 2: User Story 1 — Accurate ETA When Van Is Running Late (Priority: P1) 🎯 MVP

**Goal**: Segment fallback accumulates distances across intermediate stops instead of using single-segment distance. Falls back to schedule ETA if any intermediate segment is missing.

**Independent Test**: Simulate route with stops A→B→C, pass stop A, target stop C. Verify ETA uses cumulative distance A→B + B→C.

### Tests for User Story 1

- [x] T002 [P] [US1] Add test: 2-stop gap uses cumulative segment distance in `src/__tests__/tracking/eta.test.ts`
- [x] T003 [P] [US1] Add test: 3-stop gap uses cumulative segment distance in `src/__tests__/tracking/eta.test.ts`
- [x] T004 [P] [US1] Add test: null osrmDistanceM in middle segment falls back to schedule ETA in `src/__tests__/tracking/eta.test.ts`
- [x] T005 [P] [US1] Add test: single-stop gap (immediate successor) preserves existing behavior in `src/__tests__/tracking/eta.test.ts`

### Implementation for User Story 1

- [x] T006 [US1] Replace single-segment lookup with multi-segment accumulation loop in segment fallback block of `src/lib/tracking/eta.ts` (lines 237-260). Find last-passed index, iterate through intermediate stops summing `osrmDistanceM`, fall back to `scheduleDelayFallback` if any segment is null.
- [x] T007 [US1] Verify all existing segment fallback tests still pass, run `npx vitest run src/__tests__/tracking/eta.test.ts`

**Checkpoint**: Multi-segment ETA works. Late routes with GPS stale and multi-stop gaps show cumulative distance-based ETA.

---

## Phase 3: User Story 2 — Persisted Pointer Is the Active Progress Source (Priority: P1)

**Goal**: Default progress source is `persisted` when no env var is set. Legacy and shadow remain available as explicit opt-in.

**Independent Test**: Call `resolveRouteProgress` with no `TRACKING_PROGRESS_SOURCE` set. Verify persisted path is used.

### Tests for User Story 2

- [x] T008 [P] [US2] Update "default env var undefined" test to expect persisted mode in `src/__tests__/tracking/resolve-route-progress-modes.test.ts` (around line 459)
- [x] T009 [P] [US2] Add test: explicit `TRACKING_PROGRESS_SOURCE=legacy` uses legacy mode in `src/__tests__/tracking/resolve-route-progress-modes.test.ts`
- [x] T009b [P] [US2] Add test: explicit `TRACKING_PROGRESS_SOURCE=shadow` still computes both and serves legacy in `src/__tests__/tracking/resolve-route-progress-modes.test.ts`

### Implementation for User Story 2

- [x] T010 [US2] Change `parseProgressSource` default from `"legacy"` to `"persisted"` in `src/lib/tracking/resolve-route-progress.ts` (line 272)
- [x] T011 [US2] Run full mode test suite: `npx vitest run src/__tests__/tracking/resolve-route-progress-modes.test.ts`

**Checkpoint**: Fresh deployments use persisted pointer by default. `legacy` and `shadow` still work when explicitly set.

---

## Phase 4: User Story 3 — Stale Pointer Does Not Erase a Valid Overdue Stop (Priority: P1)

**Goal**: Two-tier staleness: pointers aged 30 min–2 hours are stale but still used if stop is pending. Beyond 2 hours, pointer is invalid. When no valid pointer and time-floor yields no stops, fall back to first pending stop by route order.

**Independent Test**: Create run with 35-min-old pointer targeting a pending overdue stop. Verify it still returns valid ETA.

### Tests for User Story 3

- [x] T012 [P] [US3] Add test: pointer at 35 min (stale but valid) still targets pointed stop in `src/__tests__/tracking/resolve-route-progress-modes.test.ts`
- [x] T013 [P] [US3] Add test: pointer at 119 min still targets pointed stop in `src/__tests__/tracking/resolve-route-progress-modes.test.ts`
- [x] T014 [P] [US3] Add test: pointer at 121 min is expired, falls back to route order in `src/__tests__/tracking/resolve-route-progress-modes.test.ts`
- [x] T015 [P] [US3] Add test: stale pointer targeting already-passed stop falls back to next pending by route order in `src/__tests__/tracking/resolve-route-progress.test.ts`
- [x] T016 [P] [US3] Add test: time-floor yields no stops (all overdue), falls back to first pending by route order in `src/__tests__/tracking/eta.test.ts`

### Implementation for User Story 3

- [x] T017 [US3] Modify pointer validation in `src/lib/tracking/resolve-route-progress.ts` (lines 168-185): add `pointerWithinCeiling` check using `POINTER_ABSOLUTE_CEILING_MINUTES`. Use pointer if `pointerExists && pointerIsPending && pointerWithinCeiling`. Update fallback logging to distinguish `"pointer_stale_but_valid"` vs `"pointer_expired"`.
- [x] T018 [US3] Add route-order fallback to `src/lib/tracking/eta.ts` (lines 80-103): when time-floor filtering yields no pending stops, fall back to first pending stop by schedule order instead of returning null ETA.
- [x] T019 [US3] Run staleness and ETA test suites: `npx vitest run src/__tests__/tracking/resolve-route-progress-modes.test.ts src/__tests__/tracking/resolve-route-progress.test.ts src/__tests__/tracking/eta.test.ts`

**Checkpoint**: Late-running routes (30 min–2 hours) retain valid ETA. Pointers older than 2 hours are expired. All-overdue routes still show next stop via route-order fallback.

---

## Phase 5: User Story 4 — Stop-Specific Snap Decision (Priority: P2)

**Goal**: Snap-vs-raw GPS decision is evaluated per candidate stop, not globally per ping. Each stop uses whichever coordinate source places the van closer.

**Independent Test**: Simulate ping with 40m snap displacement. Road stop is closer to snapped; campus stop is closer to raw. Verify each gets correct source.

### Tests for User Story 4

- [x] T020 [P] [US4] Add test: two stops with same ping — road stop uses snapped, campus stop uses raw in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [x] T021 [P] [US4] Add test: snap displacement > 50m forces raw for all stops (existing behavior) in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [x] T022 [P] [US4] Update existing snap threshold tests to expect per-stop `pass_source` labeling in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 4

- [x] T023 [US4] Refactor snap decision in `src/lib/tracking/infer-stop-progress.ts` (lines 148-163): remove global `useSnapped`/`effectiveLat`/`effectiveLng`. Keep snap displacement check as a gate (> 50m = raw for all). When within threshold, defer per-stop decision to the geofence loop.
- [x] T024 [US4] Modify geofence check loop in `src/lib/tracking/infer-stop-progress.ts` (lines 196-201): for each candidate stop, compute both `rawDist` and `snappedDist`, use whichever is shorter. Track `useSnappedForThisStop` boolean per stop for pass_source labeling.
- [x] T025 [US4] Pass per-stop snap flag to confidence calculation and `pass_source` assignment in `src/lib/tracking/infer-stop-progress.ts` (lines 257-263)
- [x] T026 [US4] Run inference test suite: `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Mixed road/campus routes get per-stop coordinate selection. Each stop's `pass_source` correctly reflects which coordinate source was used.

---

## Phase 6: User Story 5 — Confidence Evidence Matches Passage Source (Priority: P2)

**Goal**: Cap snapped-passage confidence at 0.8 (not 1.0) since raw pings are used for evidence. Removes false "high confidence" for snapped passages.

**Independent Test**: Trigger snapped geofence passage with 2+ raw pings in geofence. Verify confidence is 0.8 (not 1.0).

**Depends on**: US4 (per-stop snap flag needed to know which stops used snapped detection)

### Tests for User Story 5

- [x] T027 [P] [US5] Update test: snapped passage with 2+ pings expects confidence 0.8 (was 1.0) in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [x] T028 [P] [US5] Add test: raw passage with 2+ pings still gets confidence 0.9 (unchanged) in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [x] T029 [P] [US5] Update test: snapped passage with < 2 pings keeps confidence 0.8 (unchanged) in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 5

- [x] T030 [US5] Cap snapped-passage confidence in `src/lib/tracking/infer-stop-progress.ts` (lines 257-261): change `pingsInGeofence >= 2 && useSnapped` from 1.0 to 0.8. Both snapped tiers now return 0.8 regardless of ping count.
- [x] T031 [US5] Run inference test suite: `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Snapped passages no longer receive inflated 1.0 confidence. Raw passage confidence tiers unchanged.

---

## Phase 7: User Story 6 — Tighter Backfill Gate for Single-Stop Gaps (Priority: P2)

**Goal**: Remove `gap <= 1` unconditional backfill exception. All backfill requires confidence > 0.7.

**Independent Test**: Single raw ping at stop B (confidence 0.7), stop A pending (gap=1). Verify A is NOT backfilled. Two raw pings (confidence 0.9) DOES backfill.

### Tests for User Story 6

- [x] T032 [P] [US6] Update test "single ping DOES backfill for 1-stop gap" to expect NO backfill in `src/__tests__/tracking/infer-stop-progress.test.ts` (around line 1517)
- [x] T033 [P] [US6] Add test: 2-ping match (confidence 0.9) with gap=1 DOES trigger backfill in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 6

- [x] T034 [US6] Remove `|| gap <= 1` from backfill gate in `src/lib/tracking/infer-stop-progress.ts` (line 318). Gate becomes `const shouldBackfill = maxPassedConfidence > 0.7;`
- [x] T035 [US6] Run inference test suite: `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Single noisy ping no longer auto-passes previous stop. Multi-ping evidence still triggers backfill.

---

## Phase 8: User Story 7 — Last Known Progress for Completed/Paused Runs (Priority: P3)

**Goal**: Opt-in `includeLastKnown` query parameter lets API return progress data for non-active runs instead of null.

**Independent Test**: Complete a route run, query progress with `?includeLastKnown=true`. Verify response includes passed stops and last ETA.

### Tests for User Story 7

- [x] T036 [P] [US7] Add test: completed run with `includeLastKnown=true` returns progress in `src/__tests__/tracking/resolve-route-progress.test.ts`
- [x] T037 [P] [US7] Add test: completed run without `includeLastKnown` returns null (existing behavior) in `src/__tests__/tracking/resolve-route-progress.test.ts`
- [x] T038 [P] [US7] Add test: active run ignores `includeLastKnown` flag (always returns progress) in `src/__tests__/tracking/resolve-route-progress.test.ts`

### Implementation for User Story 7

- [x] T039 [US7] Add `includeLastKnown?: boolean` parameter to `resolveRouteProgress` args in `src/lib/tracking/resolve-route-progress.ts`. Modify early-return block (lines 81-93): skip early return for completed/idle/waiting when `includeLastKnown` is true.
- [x] T040 [P] [US7] Parse and validate `includeLastKnown` from `request.nextUrl.searchParams` using Zod boolean coercion, and pass to `resolveRouteProgress` in `src/app/api/routes/route.ts`
- [x] T041 [P] [US7] Parse and validate `includeLastKnown` from `request.nextUrl.searchParams` using Zod boolean coercion, and pass to `resolveRouteProgress` in `src/app/api/routes/[routeId]/route.ts`
- [x] T042 [US7] Run progress test suite: `npx vitest run src/__tests__/tracking/resolve-route-progress.test.ts`

**Checkpoint**: Non-active runs optionally return last-known progress. Default behavior (null) is preserved.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Full validation and cleanup across all stories.

- [x] T043 Run full tracking test suite: `npx vitest run src/__tests__/tracking/`
- [x] T044 Run lint: `npx eslint src/lib/tracking/ src/app/api/routes/`
- [x] T045 Run typecheck: `npx tsc --noEmit`
- [x] T046 Run build: `npx next build`
- [x] T047 Remove the "Known limitation" comment about single-segment distance from `src/lib/tracking/eta.ts` (no longer applicable after US1)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — add constant first
- **Phase 2 (US1)**: Depends on Phase 1 only if using ceiling constant — actually independent (eta.ts only)
- **Phase 3 (US2)**: Independent — one-line change in resolve-route-progress.ts
- **Phase 4 (US3)**: Depends on Phase 1 (uses `POINTER_ABSOLUTE_CEILING_MINUTES`)
- **Phase 5 (US4)**: Independent of US1-US3 (different file: infer-stop-progress.ts)
- **Phase 6 (US5)**: Depends on US4 (per-stop snap flag needed for confidence capping)
- **Phase 7 (US6)**: Independent of US4-US5 (different code area in infer-stop-progress.ts)
- **Phase 8 (US7)**: Independent (resolve-route-progress.ts + API handlers)
- **Phase 9 (Polish)**: Depends on all stories complete

### User Story Dependencies

```
Phase 1 (constant) ──┐
                      ├──→ US3 (staleness)
US1 (multi-segment) ──────→ independent
US2 (default flip) ───────→ independent
US4 (per-stop snap) ──────→ US5 (confidence cap) ──→ depends on US4
US6 (backfill gate) ──────→ independent
US7 (includeLastKnown) ──→ independent
```

### Parallel Opportunities

**Batch 1** (can all start immediately):
- US1 (eta.ts — segment accumulation)
- US2 (resolve-route-progress.ts — default flip)
- T001 (time.ts — add constant)
- US4 (infer-stop-progress.ts — per-stop snap)
- US6 (infer-stop-progress.ts line 318 — backfill gate, but shares file with US4)

**Batch 2** (after Batch 1):
- US3 (after T001 — needs ceiling constant)
- US5 (after US4 — needs per-stop snap flag)
- US7 (after US2 if desired, but technically independent)

**Note**: US4 and US6 both modify `infer-stop-progress.ts`. If implementing in parallel, coordinate to avoid merge conflicts. Recommended: do US4 first (larger change), then US6 (one-line change).

---

## Parallel Example: P1 Stories

```bash
# These three can start simultaneously (different files):
Task T006: "Multi-segment accumulation in src/lib/tracking/eta.ts"
Task T010: "Default flip in src/lib/tracking/resolve-route-progress.ts"
Task T001: "Add ceiling constant to src/lib/time.ts"
```

## Parallel Example: P2 Stories

```bash
# US4 tests can run in parallel:
Task T020: "Per-stop snap test — road vs campus"
Task T021: "Per-stop snap test — displacement > 50m"
Task T022: "Update existing snap threshold tests"

# After US4 implementation, US5 and US6 can start:
Task T030: "Cap snapped confidence at 0.8"
Task T034: "Remove gap <= 1 exception"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 = P1 Fixes)

1. Complete Phase 1: Add ceiling constant
2. Complete Phase 2: US1 (multi-segment ETA)
3. Complete Phase 3: US2 (default mode flip)
4. Complete Phase 4: US3 (two-tier staleness + route-order fallback)
5. **STOP and VALIDATE**: Run all tracking tests, lint, typecheck, build
6. Deploy to DEV — late routes now show valid ETA

### Incremental Delivery

1. P1 fixes → Deploy → Validate ETA for late routes (core value)
2. Add US4 + US5 → Deploy → Validate per-stop snap + confidence
3. Add US6 → Deploy → Validate backfill tightening
4. Add US7 → Deploy → Validate opt-in completed-run progress
5. Each increment adds correctness without breaking previous fixes

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US4, US5, US6 all touch `infer-stop-progress.ts` — implement US4 first (largest change), then US5 (depends on US4), then US6 (one-liner)
- US2 is the smallest change (one line) but has the biggest operational impact (flips the default)
- Commit after each story phase for clean git history
- Stop at any checkpoint to validate independently
