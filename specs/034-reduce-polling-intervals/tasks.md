# Tasks: Reduce Polling Intervals

**Input**: Design documents from `/specs/034-reduce-polling-intervals/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not requested. No test tasks included.

**Organization**: Tasks grouped by user story. US1 and US2 share the same priority (P1) and can run in parallel. US3 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Faster Van Position Updates on Route List (Priority: P1)

**Goal**: Reduce route list polling from 15s to 5s so passengers see van positions and ETAs update 3x faster.

**Independent Test**: Open route list with DevTools Network tab, confirm `/api/routes` fires every ~5s.

### Implementation for User Story 1

- [x] T001 [P] [US1] Change `refetchInterval` from `15_000` to `5_000` in `src/lib/queries/use-routes.ts`

**Checkpoint**: Route list data refreshes every 5 seconds

---

## Phase 2: User Story 2 - Faster Route Detail Updates (Priority: P1)

**Goal**: Reduce route detail polling from 15s to 5s so the live map and stop status update 3x faster.

**Independent Test**: Open a route detail page with DevTools Network tab, confirm `/api/routes/[id]` fires every ~5s.

### Implementation for User Story 2

- [x] T002 [P] [US2] Change `refetchInterval` from `15_000` to `5_000` in `src/lib/queries/use-route-detail.ts`

**Checkpoint**: Route detail data refreshes every 5 seconds

---

## Phase 3: User Story 3 - Announcements Refresh Faster (Priority: P2)

**Goal**: Reduce announcements polling from 60s to 30s so passengers see new announcements sooner.

**Independent Test**: Open app with DevTools Network tab, confirm `/api/announcements` fires every ~30s.

### Implementation for User Story 3

- [x] T003 [P] [US3] Change `refetchInterval` from `60_000` to `30_000` in `src/lib/queries/use-announcements.ts`

**Checkpoint**: Announcements data refreshes every 30 seconds

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T004 Run quality gates: lint, typecheck, build, tests
- [x] T005 Run quickstart.md validation (verify all three intervals in DevTools)

---

## Dependencies & Execution Order

### Phase Dependencies

- **US1 (Phase 1)**, **US2 (Phase 2)**, **US3 (Phase 3)**: No dependencies on each other — all can run in parallel
- **Polish (Phase 4)**: Depends on all user stories being complete

### Parallel Opportunities

- T001, T002, T003 are all [P] — different files, zero dependencies. All three can be done simultaneously.

---

## Implementation Strategy

### MVP First (All Stories)

Given the trivial scope (3 constant changes), all user stories should be implemented together in a single pass:

1. Change all three `refetchInterval` values (T001 + T002 + T003)
2. Run quality gates (T004)
3. Verify in browser (T005)
4. Commit and open PR targeting `dev`

---

## Notes

- All three tasks modify different files with no shared code — true parallel [P]
- No new dependencies, no data model changes, no API changes
- TanStack Query handles request deduplication automatically — no overlapping request risk
- Commit all changes atomically since they represent a single coherent feature
