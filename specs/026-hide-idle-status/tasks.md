# Tasks: Hide Idle Status from Passenger UI

**Input**: Design documents from `/specs/026-hide-idle-status/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 — Passenger sees operating status during shift breaks (Priority: P1) — MVP

**Goal**: Remove "Entre turnos" badge from the routes list so idle routes show "Em operação" with the green dot.

**Independent Test**: View routes list when a route has `runStatus = "idle"` — badge should show green "Em operação".

### Implementation for User Story 1

- [x] T001 [US1] Remove the `if (runStatus === "idle")` early-return block (lines 9–15) in `src/components/public/route-status-badge.tsx` so idle routes fall through to the existing `isRunning` check and display "Em operação"

**Checkpoint**: Routes list shows "Em operação" for idle routes. Detail page still shows "Entre turnos" banner (fixed in US2).

---

## Phase 2: User Story 2 — Passenger sees normal route detail during shift breaks (Priority: P1)

**Goal**: Remove "Entre turnos" amber banner from the route detail hero card so idle routes show the active hero card with next stop, ETA, and location link.

**Independent Test**: Open route detail page when route has `runStatus = "idle"` — hero card should show next stop info, not the amber banner.

### Implementation for User Story 2

- [x] T002 [US2] Remove the `if (runStatus === "idle")` early-return block (lines 54–63) in `src/components/public/hero-card.tsx` so idle routes fall through to the standard active route rendering

**Checkpoint**: Both routes list and route detail page show consistent "Em operação" experience for idle routes.

---

## Phase 3: Validation — Quality gates and driver UI verification (Priority: P2)

**Goal**: Confirm driver UI is unchanged and all quality gates pass.

**Independent Test**: View driver route card for an idle route — should still show "Entre turnos". Run lint, typecheck, and build.

### Validation Tasks

- [x] T003 Verify `src/components/driver/route-card.tsx` still contains the `idle` → "Entre turnos" case in its `statusBadge()` function (read-only check, no changes expected)
- [x] T004 Run quality gates: lint (`eslint`), type-check (`tsc --noEmit`), and build (`next build`)

**Checkpoint**: All quality gates pass. Driver UI confirmed unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: No dependencies on Phase 1 — can run in parallel (different file)
- **Phase 3 (Validation)**: Depends on Phase 1 and Phase 2 completion

### Parallel Opportunities

- T001 and T002 can run in parallel (different files, no dependencies)
- T003 and T004 must wait for T001 + T002

```bash
# Launch both story implementations in parallel:
Task: "T001 - Remove idle branch from route-status-badge.tsx"
Task: "T002 - Remove idle branch from hero-card.tsx"

# Then validate:
Task: "T003 - Verify driver UI unchanged"
Task: "T004 - Run quality gates"
```

---

## Implementation Strategy

### MVP First (Both Stories Together)

Since both US1 and US2 are P1 and trivially small (one deleted block each), implement both together:

1. Delete idle branch in `route-status-badge.tsx` (T001)
2. Delete idle branch in `hero-card.tsx` (T002)
3. Verify driver UI intact (T003)
4. Run quality gates (T004)
5. Commit and open PR targeting `dev`

---

## Notes

- This is a code-removal feature — no new code, no new files, no new dependencies
- Total changes: ~15 lines deleted across 2 files
- The `RunStatus` type and backend remain completely unchanged
- Commit message: `fix(ui): hide idle status from passenger-facing views`
