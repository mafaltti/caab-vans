# Tasks: Fix Tracking Freshness Check

**Input**: Design documents from `/specs/020-fix-tracking-freshness/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Included — plan.md explicitly includes unit tests as part of the feature scope.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Foundational (Core Utility)

**Purpose**: Add the shared freshness function and constant that both user stories depend on

- [x] T001 Add `STALENESS_THRESHOLD_MINUTES` constant (10) and `isLocationFresh(dt: DateTime): boolean` function using Luxon `diff()` in `src/lib/time.ts`
- [x] T002 Remove `isSameDay` function from `src/lib/time.ts` (no remaining callers after US1/US2 updates)

**Checkpoint**: New freshness utility ready for use by both API routes

---

## Phase 2: User Story 1 - Passenger sees van as active when GPS pings are recent (Priority: P1)

**Goal**: Routes list API uses recency-based freshness check instead of calendar-day check

**Independent Test**: Send a GPS ping via `npm run tracking:simulate`, then call `GET /api/routes` and verify `isRunning: true` and `isLocationOutdated: false`

### Tests for User Story 1

- [x] T003 [US1] Write unit tests for `isLocationFresh` covering: fresh ping (3 min ago), stale ping (15 min ago), exactly-at-threshold (10 min), null input, future timestamp, midnight crossover (23:58→00:03) in `src/__tests__/time/is-location-fresh.test.ts`

### Implementation for User Story 1

- [x] T004 [US1] Replace `isSameDay` import with `isLocationFresh` and update `isLocationUpdatedToday` logic to use recency check in `src/app/api/routes/route.ts`

**Checkpoint**: Routes list correctly shows "Em operacao" for vans with recent pings, including across midnight

---

## Phase 3: User Story 2 - Passenger sees accurate staleness indicator on route detail (Priority: P2)

**Goal**: Route detail API uses the same recency-based freshness check for consistency

**Independent Test**: Call `GET /api/routes/[routeId]` and verify `isLocationOutdated` reflects recency, not calendar day

### Implementation for User Story 2

- [x] T005 [US2] Replace `isSameDay` import with `isLocationFresh` and update freshness logic in `src/app/api/routes/[routeId]/route.ts`

**Checkpoint**: Route detail view shows consistent staleness indicator matching routes list behavior

---

## Phase 4: Polish & Validation

**Purpose**: Run quality gates and validate end-to-end

- [x] T006 Run all quality gates: lint (`npm run lint`), typecheck (`npm run typecheck`), build (`npm run build`), tests (`npm test`)
- [x] T007 Manual validation: run `npm run tracking:simulate` and verify API responses show `isRunning: true` and `isLocationOutdated: false` for all vans with fresh pings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on T001 (new function must exist before importing)
- **User Story 2 (Phase 3)**: Depends on T001 (same function). Can run in parallel with US1
- **T002 (remove isSameDay)**: Must run AFTER both T004 and T005 (callers must be updated first)
- **Polish (Phase 4)**: Depends on all implementation tasks complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 only — no dependency on US2
- **User Story 2 (P2)**: Depends on T001 only — no dependency on US1

### Parallel Opportunities

- T004 and T005 can run in parallel (different files, same dependency on T001)
- T003 can run in parallel with T004 (test file vs source file)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 (add `isLocationFresh`)
2. Complete T003 + T004 (tests + routes list fix)
3. **STOP and VALIDATE**: `npm run tracking:simulate` → check `GET /api/routes`
4. Complete T005 (route detail fix)
5. Complete T002 (remove dead `isSameDay`)
6. Run T006 + T007 (quality gates + manual validation)

---

## Notes

- Total tasks: 7
- US1 tasks: 2 (T003, T004)
- US2 tasks: 1 (T005)
- Shared/foundational: 2 (T001, T002)
- Polish: 2 (T006, T007)
- This is a minimal, focused bug fix — no new production/runtime files except the test file
