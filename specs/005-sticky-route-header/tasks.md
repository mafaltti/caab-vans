# Tasks: Sticky Route Detail Header

**Input**: Design documents from `/specs/005-sticky-route-header/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Not requested — visual/CSS-only change verified by manual testing and quality gates.

**Organization**: Tasks grouped by user story. All changes target a single file: `src/app/(public)/routes/[routeId]/page.tsx`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Persistent Navigation While Scrolling Timeline (Priority: P1) 🎯 MVP

**Goal**: Make the route detail header stick to the top of the viewport when scrolling, with frosted glass backdrop-blur effect and subtle bottom border.

**Independent Test**: Open any route detail page on a mobile viewport, scroll past the header into the timeline. The header (back button, route name, status badge) must remain pinned at the top with a semi-transparent frosted glass background. Tapping the back button must still navigate back.

### Implementation for User Story 1

- [x] T001 [US1] Restructure success state JSX: pull header out of `space-y-6` wrapper into a sticky sibling (`sticky top-0 z-20 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50 py-4`) and wrap remaining content (HeroCard, ScheduleTimeline) in a new `<div className="space-y-6 pt-6">` below it in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: Header sticks on scroll with frosted glass effect. Back button works from any scroll position. Long route names still truncate correctly.

---

## Phase 2: User Story 2 - Visual Continuity at Page Load (Priority: P2)

**Goal**: Loading skeleton mirrors the sticky header layout so there is zero layout shift when data loads and the success state renders.

**Independent Test**: Open a route detail page and observe the loading skeleton. The skeleton header must occupy the same sticky position and dimensions as the loaded header. When data arrives, the transition from skeleton to real header must cause no visible jump or reflow.

### Implementation for User Story 2

- [x] T002 [US2] Restructure loading skeleton state to mirror the sticky header layout (same sticky wrapper with frosted glass classes around the skeleton header, separate content wrapper below) in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: Loading → loaded transition shows zero layout shift. Skeleton header sticks just like the real header.

---

## Phase 3: Polish & Quality Gates

**Purpose**: Validate the change passes all project quality gates before PR.

- [x] T003 Run lint (`npm run lint`), type-check (`npx tsc --noEmit`), and build (`npm run build`) to validate changes
- [x] T004 Visually verify on mobile viewport: scroll behavior, frosted glass effect, back button functionality, long route name truncation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately (no setup or foundational work needed)
- **Phase 2 (US2)**: Depends on Phase 1 (same structural pattern applied to skeleton state)
- **Phase 3 (Polish)**: Depends on Phase 1 and Phase 2

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies — this is the core change
- **User Story 2 (P2)**: Follows the same pattern as US1 but applied to the loading skeleton. Must follow US1 so the pattern is established.

### Within Each User Story

- T001 is a single atomic edit (header extraction + content wrapping)
- T002 follows the T001 pattern

### Parallel Opportunities

- T001 and T002 are sequential (same file, T002 depends on T001 pattern)
- T003 and T004 can run in parallel (lint/build vs. visual check)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 → sticky header works on success state
2. **STOP and VALIDATE**: Scroll test on mobile viewport
3. This alone delivers the core user value

### Full Delivery

1. Complete US1 (T001) → sticky header works
2. Complete US2 (T002) → loading skeleton matches
3. Run quality gates (T003) → lint, typecheck, build pass
4. Visual verification (T004) → ready for PR

---

## Notes

- All tasks modify the same file — no parallel opportunities across files
- No new files, components, or dependencies introduced
- Error state intentionally left unchanged (no scrollable content, sticky not needed)
- The `quickstart.md` contains before/after code snippets for reference
