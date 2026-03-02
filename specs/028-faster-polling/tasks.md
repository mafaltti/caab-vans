# Tasks: Faster Polling Intervals

**Input**: Design documents from `/specs/028-faster-polling/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No setup needed — this feature modifies existing files only. No new dependencies, files, or project structure changes.

*(No tasks in this phase)*

---

## Phase 2: Foundational (Global Query Config)

**Purpose**: Update shared QueryClient defaults that affect all queries and enable window-focus refetching.

**⚠️ CRITICAL**: These global config changes underpin all three user stories.

- [x] T001 Update `staleTime` from `30 * 1000` to `10 * 1000` in `src/app/providers.tsx`
- [x] T002 Update `refetchOnWindowFocus` from `false` to `true` (or remove the line to use TanStack Query's default) in `src/app/providers.tsx`

**Checkpoint**: Global query config updated — all queries now use 10s stale time and refetch on window focus.

---

## Phase 3: User Story 1 — Timely Route Status Updates (Priority: P1) 🎯 MVP

**Goal**: Passengers see route status changes (idle → active, active → completed) within 15 seconds instead of 60 seconds.

**Independent Test**: Start or end a driver route via the API while viewing the routes list in a browser. The status badge should update within ~15 seconds.

### Implementation for User Story 1

- [x] T003 [US1] Update `refetchInterval` from `60_000` to `15_000` in `src/lib/queries/use-routes.ts`

**Checkpoint**: Routes list now polls every 15s. Status transitions visible within 15 seconds.

---

## Phase 4: User Story 2 — Immediate Refresh on App Resume (Priority: P2)

**Goal**: Route data refreshes immediately when a passenger returns to the app after switching away.

**Independent Test**: Open the routes list, switch to another tab, wait 20+ seconds, switch back. Data should refresh within 1-2 seconds.

### Implementation for User Story 2

*(Fully satisfied by T001 + T002 in Phase 2. The `refetchOnWindowFocus: true` setting triggers an immediate refetch on tab focus for all queries with data older than `staleTime` (10s). No additional tasks needed.)*

**Checkpoint**: Returning to the app triggers an immediate data refresh on all active queries.

---

## Phase 5: User Story 3 — Fresher ETA and Stop Progress (Priority: P3)

**Goal**: ETA and stop progress on the route detail page updates every 15 seconds instead of 30 seconds.

**Independent Test**: View a route detail page for an active route. ETA values should update every ~15 seconds (observable in DevTools Network tab).

### Implementation for User Story 3

- [x] T004 [US3] Update `refetchInterval` from `30_000` to `15_000` in `src/lib/queries/use-route-detail.ts`

**Checkpoint**: Route detail page now polls every 15s. ETA and stop progress are fresher.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate nothing was accidentally changed and all quality gates pass.

- [x] T005 Verify `src/lib/queries/use-announcements.ts` still has `refetchInterval: 60_000` (unchanged per FR-003)
- [x] T006 Run quality gates: lint (`eslint`), typecheck (`tsc --noEmit`), build (`next build`), tests (`vitest run`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1 (Phase 3)**: Can start after Phase 2 (global config must be set first)
- **US2 (Phase 4)**: Fully covered by Phase 2 — no additional work
- **US3 (Phase 5)**: Can start after Phase 2, in parallel with US1
- **Polish (Phase 6)**: After all implementation phases complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 (global config). No dependency on other stories.
- **User Story 2 (P2)**: Fully satisfied by Phase 2. No additional implementation.
- **User Story 3 (P3)**: Depends on Phase 2 (global config). No dependency on other stories. Can run in parallel with US1.

### Parallel Opportunities

- T003 and T004 modify different files and can run in parallel after Phase 2 completes

---

## Parallel Example: US1 + US3

```bash
# After Phase 2 (global config) completes, both can run simultaneously:
Task: "T003 [US1] Update refetchInterval in src/lib/queries/use-routes.ts"
Task: "T004 [US3] Update refetchInterval in src/lib/queries/use-route-detail.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Global QueryClient config (T001, T002)
2. Complete Phase 3: Routes list polling (T003)
3. **STOP and VALIDATE**: Test routes list updates within 15s + window focus refresh
4. Deploy to DEV if ready

### Incremental Delivery

1. Phase 2 → Global config ready (US2 immediately functional)
2. Add US1 (T003) → Routes list polls faster → Deploy/Demo (MVP!)
3. Add US3 (T004) → Route detail polls faster → Deploy/Demo
4. Phase 6 → Final validation

---

## Notes

- Total: 6 tasks (T001–T006), of which 4 are implementation changes and 2 are validation
- T003 and T004 are parallelizable (different files)
- US2 requires zero additional tasks beyond the foundational global config
- FR-006 (no request pile-up) is handled automatically by TanStack Query v5 — no implementation needed
- Commit after Phase 2, then after each user story phase
