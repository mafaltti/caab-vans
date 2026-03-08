# Tasks: Tracking Progress Hardening

**Input**: Design documents from `/specs/056-tracking-progress-hardening/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Included — each user story has dedicated test tasks for affected modules.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (No Blocking Prerequisites)

**Purpose**: No setup or foundational phase needed — all changes modify existing files in an established codebase. Proceed directly to user stories.

---

## Phase 2: User Story 1 — Consistent Next-Stop Display Under Degraded GPS (Priority: P1) MVP

**Goal**: Enforce adjacency for persisted progress pointers so commuters never see a non-adjacent next stop.

**Independent Test**: Simulate a route with low-confidence non-contiguous stop passage; verify `nextStopId` is always adjacent to `lastPassedStopId` and non-adjacent pointers are rejected by the resolver.

### Tests for User Story 1

- [x] T001 [P] [US1] Add test case in `src/__tests__/tracking/infer-stop-progress.test.ts`: when backfill is skipped (confidence <= 0.7) and a later stop is marked passed, `lastPassedStopId` is rolled back to the last contiguously-passed stop (the one immediately before the first pending stop)
- [x] T002 [P] [US1] Add test case in `src/__tests__/tracking/infer-stop-progress.test.ts`: when backfill succeeds (confidence > 0.7), `lastPassedStopId` points to the last passed stop and `nextStopId` is its immediate successor — no rollback occurs
- [x] T003 [P] [US1] Add test case in `src/__tests__/tracking/resolve-route-progress.test.ts`: when persisted `next_stop_id` is non-adjacent to `last_passed_stop_id` (pending stops exist between them), the pointer is rejected and `targetStopId` falls back to schedule-based resolution
- [x] T004 [P] [US1] Add test case in `src/__tests__/tracking/resolve-route-progress.test.ts`: when persisted `next_stop_id` is the immediate successor of `last_passed_stop_id`, the pointer is accepted normally

### Implementation for User Story 1

- [x] T005 [US1] In `src/lib/tracking/infer-stop-progress.ts` (around L396-414), after deriving `lastPassedStopId` from the allStops loop, add adjacency validation: walk the sorted stops from `nextStopId` backward — if any pending stops exist between `lastPassedStopId` and `nextStopId`, override `lastPassedStopId` to the last contiguously-passed stop (the stop immediately before the first pending stop in chronological order)
- [x] T006 [US1] In `src/lib/tracking/resolve-route-progress.ts` (around L172-189), add an adjacency check to the pointer validation block: after confirming `pointerExists && pointerIsPending && pointerWithinCeiling`, verify that `next_stop_id` is the immediate successor of `last_passed_stop_id` in `sortedEntries` (no pending `runStops` between them). If adjacency fails, do not set `targetStopId` — let it fall through to the schedule-based fallback

**Checkpoint**: At this point, non-adjacent pointers are prevented at write-time and rejected at read-time. Run `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts src/__tests__/tracking/resolve-route-progress.test.ts` to verify.

---

## Phase 3: User Story 2 — Deterministic ETA Under Varying Ping Volume (Priority: P1)

**Goal**: Make the recent-pings query deterministic so confidence scoring produces identical results for the same data window.

**Independent Test**: Run stop-inference twice with identical data; verify confidence values and backfill decisions match exactly.

### Tests for User Story 2

- [x] T007 [P] [US2] Add test case in `src/__tests__/tracking/infer-stop-progress.test.ts`: verify the recent-pings query includes a stable tiebreaker ordering (by record ID) and an explicit `.limit(50)` cap — mock the Supabase query builder to assert the chained methods

### Implementation for User Story 2

- [x] T008 [US2] In `src/lib/tracking/infer-stop-progress.ts` (L187-192), modify the `allRecentPings` query: add `.order("id", { ascending: false })` after the existing `.order("device_ts", { ascending: false })` as a stable tiebreaker, and add `.limit(50)` to explicitly cap the sample size

**Checkpoint**: Ping query is now deterministic. Run `npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts` to verify.

---

## Phase 4: User Story 3 — Overdue Stop Shown as Overdue, Not "Arriving Now" (Priority: P2)

**Goal**: Render a "Delayed" indicator in the route card when the ETA is overdue, instead of silently hiding the ETA section.

**Independent Test**: Set up a route with `etaStatus === "overdue"` in the progress data; verify the route card renders an amber "Delayed" badge instead of "ETA: ~0 min".

### Tests for User Story 3

- [x] T009 [US3] Add test case in `src/__tests__/tracking/eta.test.ts`: when segment ETA computes an arrival time in the past (e.g., 5 minutes ago), verify the result has `etaStatus: "overdue"` and `etaNextStopMinutes: null` (confirm existing backend behavior is correct before relying on it for UI)

### Implementation for User Story 3

- [x] T010 [US3] In `src/components/public/route-card.tsx` (L71-78), modify the ETA rendering block: add a parallel condition for `route.progress?.etaStatus === "overdue"` that renders a "Delayed" badge (amber/orange text with Clock icon, e.g., `<span className="text-xs text-amber-600 font-medium">Delayed</span>`) when the stop ID matches. Keep the existing `etaNextStopMinutes != null` branch for the normal "ETA: ~X min" display

**Checkpoint**: Overdue routes now show "Delayed" instead of nothing. Verify visually and run `npx vitest run src/__tests__/tracking/eta.test.ts`.

---

## Phase 5: User Story 4 — Last-Known Progress Consistent Across Response Fields (Priority: P2)

**Goal**: Ensure `includeLastKnown=true` responses have consistent top-level and nested progress fields — both populated or both null.

**Independent Test**: Query a waiting-state route with `includeLastKnown=true`; verify both `nextStop` and `progress.nextStopId` are null.

### Tests for User Story 4

- [x] T011 [P] [US4] Add test case in `src/__tests__/tracking/resolve-route-progress.test.ts`: when `runStatus === "waiting"` and `includeLastKnown === true`, verify `resolveRouteProgress()` returns `nextStopId: null` (not a stale pointer from a previous day)
- [x] T012 [P] [US4] Add test case in `src/__tests__/tracking/routes-api.test.ts`: when a completed route is queried with `includeLastKnown=true`, verify the top-level `nextStop` matches `progress.nextStopId` (both populated or both null)

### Implementation for User Story 4

- [x] T013 [US4] In `src/lib/tracking/resolve-route-progress.ts`, add a waiting-state nullification after the early-return gate (around L83-96): when `runStatus === "waiting"` and `includeLastKnown === true`, return the same null-progress response as the early return (null out `nextStopId`, `etaNextStopISO`, `etaNextStopMinutes`). This centralizes the exclusion logic that currently lives in both route handlers

**Checkpoint**: API responses are now consistent. Run `npx vitest run src/__tests__/tracking/resolve-route-progress.test.ts src/__tests__/tracking/routes-api.test.ts`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and quality gates

- [x] T014 Run full tracking test suite: `npx vitest run src/__tests__/tracking/`
- [x] T015 Run type-check: `npx tsc --noEmit`
- [x] T016 Run lint: `npx eslint src/lib/tracking/ src/components/public/route-card.tsx src/__tests__/tracking/`
- [x] T017 Run build: `npx next build`
- [x] T018 Run quickstart.md validation steps from `specs/056-tracking-progress-hardening/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (US1)**: No dependencies — can start immediately
- **Phase 3 (US2)**: No dependencies on US1 — can run in parallel (different code paths in same file, but non-overlapping lines)
- **Phase 4 (US3)**: No dependencies on US1/US2 — different file (`route-card.tsx`)
- **Phase 5 (US4)**: No dependencies on US1/US2/US3 — different code path in `resolve-route-progress.ts`
- **Phase 6 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — modifies `infer-stop-progress.ts` L396-414 and `resolve-route-progress.ts` L172-189
- **US2 (P1)**: Independent — modifies `infer-stop-progress.ts` L187-192 (non-overlapping with US1)
- **US3 (P2)**: Independent — modifies `route-card.tsx` L71-78 only
- **US4 (P2)**: Independent — modifies `resolve-route-progress.ts` L83-96 (non-overlapping with US1's L172-189 changes)

### Within Each User Story

- Tests written first, expected to fail
- Implementation follows
- Checkpoint verifies tests pass

### Parallel Opportunities

- US1, US2, US3, and US4 can ALL run in parallel (different code regions or different files)
- Within US1: T001-T004 (tests) can run in parallel; T005 and T006 can run in parallel (different files)
- Within US4: T011-T012 (tests) can run in parallel

---

## Parallel Example: All User Stories

```bash
# All four user stories can be launched simultaneously:
# Agent 1: US1 — adjacency enforcement (infer-stop-progress.ts L396+, resolve-route-progress.ts L172+)
# Agent 2: US2 — deterministic query (infer-stop-progress.ts L187-192)
# Agent 3: US3 — overdue UI rendering (route-card.tsx L71-78)
# Agent 4: US4 — includeLastKnown consistency (resolve-route-progress.ts L83-96)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: US1 (adjacency enforcement)
2. **STOP and VALIDATE**: Run adjacency tests
3. This alone prevents the most user-visible bug (wrong next stop)

### Incremental Delivery

1. US1 (adjacency) → Test → Most critical fix deployed
2. US2 (deterministic query) → Test → Confidence stability
3. US3 (overdue UI) → Test → Better user communication
4. US4 (includeLastKnown) → Test → API consistency
5. Polish → Full quality gates → PR ready

---

## Notes

- All changes modify existing files — no new files created
- US1 and US2 both touch `infer-stop-progress.ts` but at non-overlapping line ranges (L396+ vs L187-192) — safe to parallelize
- US1 and US4 both touch `resolve-route-progress.ts` but at non-overlapping line ranges (L172-189 vs L83-96) — safe to parallelize
- Commit after each user story checkpoint for clean git history
