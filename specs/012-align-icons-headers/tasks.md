# Tasks: Align Stop Icons & Fixed Headers

**Input**: Design documents from `/specs/012-align-icons-headers/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Not requested — visual verification is manual per quickstart.md.

**Organization**: Tasks are grouped by user story. Both stories are P1 and fully independent (no shared setup or foundational tasks needed).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Visually Distinct Stop States in Timeline (Priority: P1)

**Goal**: Update timeline stop icons to match AI Studio prototype — hollow circles for future/neutral, concentric circles for current, checkmark for past (unchanged).

**Independent Test**: Open any active route detail page. Verify past stops show checkmark, current stop shows concentric blue circles, future stops show hollow circle. Open an inactive route and verify all stops show hollow circles.

### Implementation for User Story 1

- [x] T001 [US1] Update `TimelineNode` current stop to concentric circles (remove `animate-pulse`, change inner div to `size-3 bg-blue-600`) in `src/components/public/schedule-timeline.tsx`
- [x] T002 [US1] Update `TimelineNode` future/neutral stops to hollow circle (remove inner `<div>` child, keep outer circle with border only) in `src/components/public/schedule-timeline.tsx`

**Checkpoint**: Stop icons match AI Studio prototype for all four states (past, current, future, neutral).

---

## Phase 2: User Story 2 - Fixed Page Headers That Never Move (Priority: P1)

**Goal**: Convert all page headers from `sticky` to `fixed` positioning so they never move during scrolling. Add spacer divs to prevent content overlap.

**Independent Test**: Scroll on each public page (Rotas, Avisos, Route Detail). Headers should remain motionless from the first scroll pixel. No content should be hidden behind headers.

### Implementation for User Story 2

- [x] T003 [US2] Adjust layout top padding for fixed headers in `src/app/(public)/layout.tsx`
- [x] T004 [P] [US2] Convert Routes list header from `sticky` to `fixed` with spacer div in `src/app/(public)/page.tsx`
- [x] T005 [P] [US2] Convert Announcements header from `sticky` to `fixed` with spacer div in `src/app/(public)/avisos/page.tsx`
- [x] T006 [P] [US2] Convert Route Detail header (loaded + skeleton states) from `sticky` to `fixed` with spacer div in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: All three pages have fixed headers that never move. Content is not hidden behind headers.

---

## Phase 3: Polish & Cross-Cutting Concerns

- [x] T007 Run lint, typecheck, and build to verify no regressions
- [ ] T008 Run quickstart.md validation (manual visual check on all pages)

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: No dependencies — can start immediately (independent of US1)
- **Polish (Phase 3)**: Depends on both US1 and US2 completion

### User Story Dependencies

- **US1**: Self-contained in one file (`schedule-timeline.tsx`). T001 and T002 are sequential (same file).
- **US2**: T003 (layout) should complete first. Then T004, T005, T006 can run in parallel (different files).

### Parallel Opportunities

- US1 and US2 can be implemented entirely in parallel (no shared files).
- Within US2: T004, T005, T006 can run in parallel after T003.

---

## Parallel Example: User Story 2

```bash
# First, complete layout adjustment:
Task: "T003 - Adjust layout top padding in src/app/(public)/layout.tsx"

# Then launch all page header conversions in parallel:
Task: "T004 - Convert Routes header in src/app/(public)/page.tsx"
Task: "T005 - Convert Announcements header in src/app/(public)/avisos/page.tsx"
Task: "T006 - Convert Route Detail header in src/app/(public)/routes/[routeId]/page.tsx"
```

---

## Implementation Strategy

### MVP First (Either Story)

Both stories are P1 and independent. Either can serve as MVP:
1. Complete US1 (stop icons) — 1 file, 2 tasks
2. Complete US2 (fixed headers) — 4 files, 4 tasks
3. Run quality gates (T007)
4. Each story delivers value independently

### Recommended Order

1. US1 first (smaller, 1 file) → validate visually
2. US2 second (4 files, more changes) → validate visually
3. Quality gates → PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Both user stories are independently completable and testable
- Commit after each story for clean git history
- All changes are CSS/Tailwind class modifications — no new files or dependencies
