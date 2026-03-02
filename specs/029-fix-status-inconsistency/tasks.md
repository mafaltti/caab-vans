# Tasks: Fix Status Inconsistency

**Input**: Design documents from `/specs/029-fix-status-inconsistency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Foundational (API Fix)

**Purpose**: Fix the API to return `runStatus: "completed"` instead of nullifying the entire `progress` object. This unblocks the "Encerrada" badge state for both user stories.

**⚠️ CRITICAL**: Both user stories depend on this fix for the "completed" state to reach the frontend.

- [X] T001 [P] Fix list API to return minimal progress object when `runStatus === "completed"` instead of setting `progress = null` in `src/app/api/routes/route.ts`
- [X] T002 [P] Fix detail API to return minimal progress object when `runStatus === "completed"` instead of setting `progress = null` in `src/app/api/routes/[routeId]/route.ts`

**Checkpoint**: Both APIs now return `progress.runStatus` for all lifecycle states including "completed".

---

## Phase 2: User Story 1 - Passenger sees accurate status on route list (Priority: P1) 🎯 MVP

**Goal**: The route list page shows a badge that accurately reflects shift lifecycle state — 4 distinct variants instead of just 2.

**Independent Test**: View the route list page with vans in different states (active shift, no shift, ended shift, completed). Verify each van shows the correct badge: "Em operação" (green), "Aguardando início" (amber), "Encerrada" (muted emerald), or "Fora de operação" (zinc).

### Implementation for User Story 1

- [X] T003 [US1] Expand `RouteStatusBadge` component to accept optional `runStatus` and `scheduleStatus` props and implement 4-variant badge mapping (in_progress → green "Em operação" with pulse, waiting/idle → amber "Aguardando início", completed → muted emerald "Encerrada", default → zinc "Fora de operação") in `src/components/public/route-status-badge.tsx`
- [X] T004 [US1] Pass `route.progress?.runStatus` and `route.scheduleStatus` from `RouteCard` to `RouteStatusBadge` in `src/components/public/route-card.tsx`

**Checkpoint**: Route list page shows correct badge for each van's lifecycle state.

---

## Phase 3: User Story 2 - Status consistency between list and detail (Priority: P1)

**Goal**: The detail page header badge matches the list page badge for the same route.

**Independent Test**: For each route, compare the badge on the list card with the badge in the detail page header. They must show the same label and color.

### Implementation for User Story 2

- [X] T005 [US2] Pass `route.progress?.runStatus` and `route.scheduleStatus` to `RouteStatusBadge` in the detail page header in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: Detail page header badge and list page badge show identical status for the same route.

---

## Phase 4: Polish & Validation

**Purpose**: Ensure quality gates pass and verify all acceptance scenarios.

- [X] T006 Run quality gates: lint (`pnpm lint`), typecheck (`pnpm typecheck`), and build (`pnpm build`)
- [ ] T007 Manual verification of all 5 acceptance scenarios from US1 using quickstart.md test plan

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. T001 and T002 are parallelizable (different files).
- **User Story 1 (Phase 2)**: Depends on Phase 1. T003 must complete before T004 (T004 passes props to the component T003 modifies).
- **User Story 2 (Phase 3)**: Depends on T003 (uses the updated badge component). Can run in parallel with T004 since it modifies a different file.
- **Polish (Phase 4)**: Depends on all implementation tasks.

### Parallel Opportunities

- T001 + T002 can run in parallel (different API route files, identical change pattern)
- T004 + T005 can run in parallel after T003 (different consumer files, same badge component)

---

## Parallel Example

```text
# Phase 1 — launch both API fixes in parallel:
T001: Fix list API progress nullification in src/app/api/routes/route.ts
T002: Fix detail API progress nullification in src/app/api/routes/[routeId]/route.ts

# Phase 2+3 — after T003 (badge component), launch consumers in parallel:
T004: Wire runStatus in RouteCard (src/components/public/route-card.tsx)
T005: Wire runStatus in detail page header (src/app/(public)/routes/[routeId]/page.tsx)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: API fix (T001 + T002 in parallel)
2. Complete Phase 2: Badge component + RouteCard wiring (T003 → T004)
3. **STOP and VALIDATE**: Route list shows correct badges for all states
4. Deploy/demo if ready

### Full Delivery

1. Complete Phase 1 → API returns all runStatus values
2. Complete Phase 2 → Route list badges are accurate (MVP!)
3. Complete Phase 3 → Detail page header badge matches list
4. Complete Phase 4 → Quality gates pass, manual verification done

---

## Notes

- Total tasks: 7 (2 API, 2 component, 1 page, 2 validation)
- No new files created — all modifications to existing files
- No database or schema changes
- The badge component change (T003) is the core task — it implements the 4-variant mapping logic
- Keep `isRunning` as a fallback prop for backward compatibility in case any other consumer still passes only `isRunning`
