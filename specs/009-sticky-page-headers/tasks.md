# Tasks: Sticky Page Headers

**Input**: Design documents from `/specs/009-sticky-page-headers/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story. Both stories are P1 and can run in parallel (different files).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: User Story 1 - Sticky header on Rotas page (Priority: P1) 🎯 MVP

**Goal**: The "Rotas" page title stays pinned at the top with frosted glass effect while scrolling route cards.

**Independent Test**: Load the routes page, scroll down through route cards, verify the "Rotas" title remains visible with semi-transparent blur background and bottom border.

### Implementation for User Story 1

- [x] T001 [P] [US1] Refactor Rotas page to use a single return with sticky header and conditional content in `src/app/(public)/page.tsx` — wrap the `<h1>` in a sticky `<div>` with classes `sticky top-0 z-20 -mx-4 px-5 py-4 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50`, remove duplicate `<h1>` from loading and error early returns, consolidate into one return with conditional content below the header

**Checkpoint**: Rotas page header stays pinned while scrolling in all states (loading, error, empty, populated).

---

## Phase 2: User Story 2 - Sticky header on Avisos page (Priority: P1)

**Goal**: The "Avisos" page title stays pinned at the top with frosted glass effect while scrolling announcements, consistent with Rotas.

**Independent Test**: Load the announcements page, scroll down through announcement cards, verify the "Avisos" title remains visible with identical visual treatment to Rotas.

### Implementation for User Story 2

- [x] T002 [P] [US2] Refactor Avisos page to use a single return with sticky header and conditional content in `src/app/(public)/avisos/page.tsx` — wrap the `<h1>` in a sticky `<div>` with classes `sticky top-0 z-20 -mx-4 px-5 py-4 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50`, remove duplicate `<h1>` from loading and error early returns, consolidate into one return with conditional content below the header

**Checkpoint**: Both Rotas and Avisos pages have consistent sticky headers.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates validation

- [x] T003 Run quality gates: lint (`eslint`), typecheck (`tsc --noEmit`), and build (`next build`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: No dependencies — can start immediately (different file)
- **Polish (Phase 3)**: Depends on both user stories being complete

### Parallel Opportunities

- T001 and T002 can run in parallel (different files, no shared dependencies)
- T003 must run after both T001 and T002

```bash
# Both stories can launch in parallel:
Task T001: "Refactor Rotas page sticky header in src/app/(public)/page.tsx"
Task T002: "Refactor Avisos page sticky header in src/app/(public)/avisos/page.tsx"

# Then validate:
Task T003: "Run quality gates"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 (Rotas sticky header)
2. **STOP and VALIDATE**: Scroll test on Rotas page
3. Deploy/demo if ready

### Full Delivery

1. Complete T001 + T002 in parallel
2. Run T003 (quality gates)
3. Open PR targeting `dev`

---

## Notes

- Both tasks modify different files — safe to parallelize
- No new components or files created — inline changes only (2 occurrences < 3, per DRY rule)
- No data model, API, or dependency changes
- Commit after each task (one commit per page)
