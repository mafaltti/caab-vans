# Tasks: Fix ETA Idle Suppression

**Input**: Design documents from `specs/025-fix-eta-idle-suppression/`
**Prerequisites**: plan.md, spec.md, research.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Public ETA persists after driver ends shift (Priority: P1) MVP

**Goal**: Remove idle suppression so ETA/progress data is always computed when a route run exists, except when completed.

**Independent Test**: End a driver shift, verify the public routes page still shows ETA for that route. Verify other vans are unaffected.

### Implementation for User Story 1

- [x] T001 [P] [US1] Remove `if (runStatus === "idle") { progress = null; }` condition (lines 155-156) in `src/app/api/routes/route.ts` — replace with `if (runStatus === "completed") { progress = null; }` to only suppress ETA when the route is done for the day
- [x] T002 [P] [US1] Remove identical idle suppression (lines 161-162) in `src/app/api/routes/[routeId]/route.ts` — replace with `if (runStatus === "completed") { progress = null; }` to match the list endpoint

**Checkpoint**: Public page shows ETA for idle routes. "Completed" routes still suppress ETA.

---

## Phase 2: User Story 2 - Driver UI still reflects shift status (Priority: P2)

**Goal**: Verify driver UI is unaffected by the change — no code changes expected, only manual verification.

**Independent Test**: Start and end a shift as driver, verify badges show correct status ("Em andamento" → "Entre turnos").

### Implementation for User Story 2

- [x] T003 [US2] Verify driver UI is unaffected — no code changes needed. Confirm `src/components/driver/route-card.tsx` status badges still work correctly since they rely on local state, not the `/api/routes` progress payload.

**Checkpoint**: Driver UI badges render correctly for all shift states.

---

## Phase 3: Polish & Cross-Cutting Concerns

- [x] T004 Run quality gates: lint (`eslint`), typecheck (`tsc --noEmit`), build (`next build`)
- [ ] T005 Run manual validation per `specs/025-fix-eta-idle-suppression/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Verification only — can run after Phase 1 or in parallel
- **Phase 3 (Polish)**: Depends on Phase 1 completion

### Parallel Opportunities

- T001 and T002 modify different files and can run in parallel
- T003 is verification only and can run after T001/T002

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 + T002 in parallel (both are independent file changes)
2. Run T004 (quality gates)
3. **STOP and VALIDATE**: Test per quickstart.md
4. Complete T003 (driver UI verification)
5. Complete T005 (final validation)

---

## Notes

- This is a minimal 2-file fix. Each task changes a single condition in one file.
- No new files, no new dependencies, no data model changes.
- The "completed" suppression (FR-002) is added as part of T001/T002 since it replaces the idle condition.
