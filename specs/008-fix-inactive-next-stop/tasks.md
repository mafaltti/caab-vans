# Tasks: Hide Next-Stop Display for Inactive Routes

**Input**: Design documents from `/specs/008-fix-inactive-next-stop/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story. No setup or foundational phases needed (existing project, no new infrastructure).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Accurate Route Status on Route List (Priority: P1) 🎯 MVP

**Goal**: Non-running routes return `nextStop = null` from the BFF so route list cards no longer display misleading next-stop info.

**Independent Test**: View the route list when routes have `isRunning = false` — no next-stop row should appear on those cards. Running routes must still show next stop as usual.

### Implementation for User Story 1

- [x] T001 [P] [US1] Nullify `nextStop` when `!isRunning` in routes list API handler in `src/app/api/routes/route.ts`
- [x] T002 [P] [US1] Nullify `nextStop` when `!isRunning` in route detail API handler in `src/app/api/routes/[routeId]/route.ts`

**Checkpoint**: Route list cards should now hide next-stop for non-running routes. Verify with manual test per quickstart.md.

---

## Phase 2: User Story 2 - Accurate Hero Card on Route Detail (Priority: P1)

**Goal**: Non-running route detail pages show a neutral gray "Fora de operação" hero card instead of the blue "PRÓXIMA PARADA" card.

**Independent Test**: Navigate to a route detail page for a non-running route — hero card should show gray "Fora de operação" instead of blue next-stop card. Running routes and ended schedules must still display correctly.

### Implementation for User Story 2

- [x] T003 [US2] Add `!isRunning` early-return fallback (gray card with "Fora de operação") in `src/components/public/hero-card.tsx`

**Checkpoint**: Both route list and route detail now correctly handle non-running routes. All three hero card states (running, not running, ended) display the correct UI.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T004 Run quality gates: lint, typecheck, and build per quickstart.md verification steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **US1 (Phase 1)**: No dependencies — can start immediately
- **US2 (Phase 2)**: Depends on T001 + T002 (BFF must return `null` for hero card to receive correct data)
- **Polish (Phase 3)**: Depends on all implementation tasks complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies. BFF fix handles route card automatically (existing `{route.nextStop && ...}` conditional).
- **User Story 2 (P1)**: Depends on US1 completion (hero card needs BFF to return `nextStop = null` for non-running routes).

### Within Each User Story

- T001 and T002 are parallelizable (different files, identical logic)
- T003 depends on T001 + T002 being complete
- T004 runs last

### Parallel Opportunities

- T001 and T002 can run in parallel (different API handler files, same pattern)

---

## Parallel Example: User Story 1

```bash
# Launch both BFF handler fixes together:
Task: "Nullify nextStop when !isRunning in src/app/api/routes/route.ts"
Task: "Nullify nextStop when !isRunning in src/app/api/routes/[routeId]/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 + T002 (BFF fix)
2. **STOP and VALIDATE**: Route list cards hide next-stop for non-running routes
3. This alone resolves the most visible user-facing bug

### Incremental Delivery

1. T001 + T002 → BFF fix → Route list corrected (MVP!)
2. T003 → Hero card fallback → Route detail corrected
3. T004 → Quality gates → Ready for PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Only 3 files change, ~10 lines total
- No new files, no new dependencies, no schema changes
- `route-card.tsx` needs NO changes — existing null-check handles it
- `src/lib/time.ts` needs NO changes — `getNextStop()` stays pure
