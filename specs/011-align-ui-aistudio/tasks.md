# Tasks: Align UI with AI Studio Prototype

**Input**: Design documents from `/specs/011-align-ui-aistudio/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, quickstart.md

**Tests**: Not requested — test tasks omitted.

**Organization**: Tasks are grouped by user story. All 3 stories modify different files and can run in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Route Card Layout (Priority: P1) MVP

**Goal**: Move the status badge to the top-right corner of the card header and move the chevron icon inside the next-stop info bar.

**Independent Test**: Load the routes list page (`/`) and verify: (1) badge is top-right on a separate row from the title, (2) chevron is inside the next-stop bar after the time, (3) no chevron appears on cards without a next-stop bar.

### Implementation for User Story 1

- [x] T001 [P] [US1] Restructure route card header to place status badge in top-right corner using `flex justify-between items-start mb-3` layout (bus icon + route name left, badge right) in `src/components/public/route-card.tsx`
- [x] T002 [US1] Move ChevronRight icon from top-right of card into the next-stop info bar, right-aligned after the time, and remove chevron when no next-stop info bar exists in `src/components/public/route-card.tsx`

**Checkpoint**: Route cards on the listing page match the AI Studio prototype layout (badge top-right, chevron in info bar).

---

## Phase 2: User Story 2 - Urgent Notice Accent Bar (Priority: P2)

**Goal**: Add a rose-colored left accent bar to urgent announcement cards.

**Independent Test**: Load the Avisos page (`/avisos`) and verify: (1) urgent cards show a vertical rose bar on the left edge, (2) non-urgent cards have no left bar.

### Implementation for User Story 2

- [x] T003 [P] [US2] Add a rose-colored left accent bar (`absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500`) to urgent announcement cards, rendered conditionally on `isUrgent`, in `src/components/public/announcement-card.tsx`

**Checkpoint**: Urgent announcement cards display a left accent bar matching the AI Studio prototype.

---

## Phase 3: User Story 3 - Schedule Previous-Stops Toggle (Priority: P3)

**Goal**: Reposition the "Ver paradas anteriores" button inline with the "Horarios" header (right-aligned) and make it a bidirectional show/hide toggle.

**Independent Test**: Open a route detail page (`/routes/[id]`) with past stops and verify: (1) toggle button appears right-aligned in the "Horarios" header row, (2) clicking shows past stops and button text changes to hide action, (3) clicking again hides past stops.

### Implementation for User Story 3

- [x] T004 [P] [US3] Move the "Ver paradas anteriores" button from standalone position above the timeline to inline with the "Horarios" header using `flex items-center justify-between` layout in `src/components/public/schedule-timeline.tsx`
- [x] T005 [US3] Make the toggle bidirectional: when past stops are visible, change button text to "Ocultar paradas anteriores" (or "Ocultar N paradas anteriores") and allow hiding them again in `src/components/public/schedule-timeline.tsx`

**Checkpoint**: Schedule toggle matches the AI Studio prototype (inline header, bidirectional).

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation.

- [x] T006 Run lint (`npm run lint`), type-check (`npx tsc --noEmit`), and build (`npm run build`) to verify no regressions
- [ ] T007 Visual comparison of all 3 changes against AI Studio prototype per `specs/011-align-ui-aistudio/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: No dependencies — can start immediately
- **User Story 3 (Phase 3)**: No dependencies — can start immediately
- **Polish (Phase 4)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent — modifies only `route-card.tsx`
- **User Story 2 (P2)**: Independent — modifies only `announcement-card.tsx`
- **User Story 3 (P3)**: Independent — modifies only `schedule-timeline.tsx`

All 3 stories can run in parallel since they touch different files.

### Within Each User Story

- T001 before T002 (same file, badge layout must be restructured before chevron can be repositioned)
- T003 is standalone (single task)
- T004 before T005 (button must be repositioned before toggle behavior is updated)

### Parallel Opportunities

- T001, T003, T004 can all start simultaneously (different files)
- After T001 completes: T002 can start
- After T004 completes: T005 can start
- T006 and T007 run after all implementation tasks complete

---

## Parallel Example: All User Stories

```text
# All 3 stories can launch in parallel (different files):
Task T001: "Restructure route card header layout in src/components/public/route-card.tsx"
Task T003: "Add urgent accent bar in src/components/public/announcement-card.tsx"
Task T004: "Move toggle button to header row in src/components/public/schedule-timeline.tsx"

# Then sequential follow-ups within each story:
Task T002: "Move chevron into info bar in src/components/public/route-card.tsx" (after T001)
Task T005: "Make toggle bidirectional in src/components/public/schedule-timeline.tsx" (after T004)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 + T002 (route card layout)
2. **STOP and VALIDATE**: Visually compare route cards against prototype
3. Commit if correct

### Incremental Delivery

1. User Story 1 (T001-T002) → Commit (route card aligned)
2. User Story 2 (T003) → Commit (accent bar added)
3. User Story 3 (T004-T005) → Commit (toggle repositioned)
4. Polish (T006-T007) → Quality gates pass → PR ready

### Parallel Strategy

All 3 stories are independent and can run simultaneously:
- Agent A: US1 (route-card.tsx)
- Agent B: US2 (announcement-card.tsx)
- Agent C: US3 (schedule-timeline.tsx)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All 3 user stories are fully independent (different component files)
- Commit after each user story for atomic, reviewable changes
- No new files, dependencies, or data model changes
- Reference: AI Studio prototype at `github.com/mafaltti/caab-vans-aistudio` (`src/App.tsx`)
