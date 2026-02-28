# Tasks: Route Detail Header Redesign

**Input**: Design documents from `/specs/004-route-header-redesign/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, quickstart.md

**Tests**: Not requested in the feature specification. No test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: User Story 1 - Navigate Back from Route Details (Priority: P1) MVP

**Goal**: Redesign the route detail page header by removing the sticky header bar and replacing it with an inline row containing an icon-only back button (ArrowLeft size 24, `aria-label="Voltar"`, `rounded-full`, `min-h-[44px]`), the route name, and the status badge. Update loading and error states to match.

**Independent Test**: Open any route detail page. Verify: (1) no sticky header bar, (2) back arrow + title + badge in a single inline row at the top of content, (3) tapping back arrow returns to route list, (4) screen reader announces "Voltar" on the back button.

### Implementation for User Story 1

- [X] T001 [US1] Redesign success state header: remove sticky header `<div>` and replace with inline flex row (`flex items-center justify-between`) containing icon-only back button (`ArrowLeft size={24}`, `p-2 -ml-2 mr-2 rounded-full hover:bg-zinc-200/50 min-h-[44px]`, `aria-label="Voltar"`), route name (`text-2xl font-bold truncate`), and `RouteStatusBadge` in `src/app/(public)/routes/[routeId]/page.tsx`
- [X] T002 [US1] Update loading state skeleton to reflect new inline header layout: replace current skeleton block with a single flex row containing back button area skeleton (`size-6 rounded-full`), title skeleton (`h-7 flex-1`), and badge skeleton (`h-5 w-24 rounded-full`) in `src/app/(public)/routes/[routeId]/page.tsx`
- [X] T003 [US1] Update error state back button to icon-only style: remove "Voltar" text, use `ArrowLeft size={24}` with `p-2 rounded-full hover:bg-zinc-200/50 min-h-[44px]` and `aria-label="Voltar"` in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: At this point, User Story 1 should be fully functional — the header displays inline with icon-only back navigation, and all three states (success, loading, error) are consistent.

---

## Phase 2: User Story 2 - View Header with Long Route Names (Priority: P2)

**Goal**: Ensure route names of any length truncate gracefully with an ellipsis without breaking the header layout. The back arrow and status badge must remain fully visible regardless of name length.

**Independent Test**: Open a route with a long name (20+ characters). Verify: (1) title truncates with ellipsis, (2) back arrow and status badge are fully visible, (3) layout does not wrap or break.

### Implementation for User Story 2

- [X] T004 [US2] Verify and ensure truncation behavior: confirm the route name element has `truncate` and `min-w-0` classes, and the parent flex row uses proper flex constraints so the title shrinks while back button and badge remain fixed-width in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: Both user stories are complete — inline header with proper truncation for all name lengths.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates validation before PR

- [X] T005 Run lint check (`npx eslint .`) and fix any violations
- [X] T006 Run type check (`npx tsc --noEmit`) and fix any errors
- [X] T007 Run build (`npm run build`) and verify success
- [X] T008 Run quickstart.md validation: manual test on dev server per `specs/004-route-header-redesign/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: Depends on US1 completion (T001 establishes the layout that T004 verifies)
- **Polish (Phase 3)**: Depends on all user stories being complete

### Within Each User Story

- T001 → T002 → T003 (sequential — same file, each edit depends on prior state)
- T004 depends on T001 (verifies the layout T001 creates)
- T005, T006, T007 can run in parallel (independent quality checks)

### Parallel Opportunities

- T005, T006, T007 can run in parallel (lint, typecheck, build are independent)
- No parallelism within US1 or US2 (all tasks modify the same file)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 → T002 → T003
2. **STOP and VALIDATE**: Test User Story 1 independently (open route detail, verify inline header, test back navigation)
3. Continue to Phase 2 if MVP looks good

### Incremental Delivery

1. US1 (T001-T003) → Core header redesign functional → Validate
2. US2 (T004) → Truncation verified → Validate
3. Polish (T005-T008) → Quality gates pass → Ready for PR

---

## Notes

- All tasks modify the same file: `src/app/(public)/routes/[routeId]/page.tsx`
- No new files, components, or dependencies are introduced
- Commit after each logical group (e.g., after T003 for US1, after T004 for US2)
- Reference design: AI Studio prototype at `github.com/mafaltti/caab-vans-aistudio` (App.tsx `RouteDetails` component)
