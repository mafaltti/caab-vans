# Tasks: Inactive Route Schedule Display

**Input**: Design documents from `/specs/010-inactive-route-schedule/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not requested in feature specification. Skipped.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Type Definition)

**Purpose**: Add the `"neutral"` stop status that both user stories depend on

- [x] T001 Add `"neutral"` to `TimelineStopStatus` union type in `src/types/index.ts`

**Checkpoint**: Type system updated — `"neutral"` status available for component use

---

## Phase 2: User Story 1 - View full schedule for inactive route (Priority: P1) 🎯 MVP

**Goal**: When a route is out of operation, show all schedule stops immediately with neutral styling — no collapsible, no "past" checkmarks.

**Independent Test**: Navigate to any route detail page when the route is not running. Verify: all stops visible immediately, no "Ver X paradas anteriores" button, neutral dot indicators with standard-contrast text.

### Implementation for User Story 1

- [x] T002 [US1] Add `isRunning` prop to `ScheduleTimelineProps` type and component signature in `src/components/public/schedule-timeline.tsx`
- [x] T003 [US1] Update `deriveTimelineStops` to return all stops with `"neutral"` status when `isRunning` is `false` in `src/components/public/schedule-timeline.tsx`
- [x] T004 [US1] Add `"neutral"` case to `TimelineNode` component rendering (reuse future-node visual style: white bg, zinc border, gray dot) in `src/components/public/schedule-timeline.tsx`
- [x] T005 [US1] Update `ScheduleTimeline` component to skip past-stop filtering and hide the collapsible button when `isRunning` is `false` in `src/components/public/schedule-timeline.tsx`
- [x] T006 [US1] Add neutral text styling for stop names (`text-zinc-700`) and times (`text-zinc-700`) in `src/components/public/schedule-timeline.tsx`
- [x] T007 [US1] Pass `isRunning={route.isRunning}` to `ScheduleTimeline` in `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: Inactive routes show all stops immediately with neutral styling. Active routes still work (US2 verification next).

---

## Phase 3: User Story 2 - Active route retains collapsible behavior (Priority: P1)

**Goal**: Regression guard — verify active routes retain existing collapsible past-stops behavior unchanged.

**Independent Test**: Navigate to a route detail page when the route IS running. Verify: past stops hidden behind collapsible, current stop has blue pulsing dot, "Ver X paradas anteriores" button works.

### Verification for User Story 2

- [ ] T008 [US2] Manually verify active route collapsible behavior is unchanged — past stops hidden, "Ver X paradas anteriores" button present, current stop has blue pulse, future stops have neutral dots (REQUIRES MANUAL TESTING)

**Checkpoint**: Both inactive (US1) and active (US2) behaviors confirmed working

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T009 Run lint check: `npx eslint .`
- [x] T010 Run type check: `npx tsc --noEmit`
- [x] T011 Run build: `npm run build`
- [x] T012 Run tests: `npx vitest run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 (T001 must complete first)
- **User Story 2 (Phase 3)**: Depends on Phase 2 (manual verification after US1 implementation)
- **Polish (Phase 4)**: Depends on Phase 2 completion

### Within User Story 1

- T002 → T003 → T004, T005, T006 (T004/T005/T006 can be done in any order after T003) → T007

### Parallel Opportunities

- T004, T005, T006 modify different sections of the same file but are logically independent — can be done as a single pass through `schedule-timeline.tsx`
- T009, T010, T011, T012 (quality gates) can run in parallel

---

## Implementation Strategy

### MVP First (Single Pass)

This feature is small enough to implement in a single pass:

1. T001: Update type definition (1 line change)
2. T002–T006: Update `schedule-timeline.tsx` (all changes in one file, best done as a single cohesive edit)
3. T007: Update page component (1 line change)
4. T008: Manual verification
5. T009–T012: Quality gates

### Recommended Approach

Given the small scope (3 files, ~20 lines changed), implement T001–T007 as a single atomic commit, then run quality gates.

---

## Notes

- No test tasks included — not requested in feature specification
- US2 is a regression guard (verification only, no new code) — manual testing confirms existing behavior unchanged
- All code changes happen in the same 3 files; no new files created
- The `isRunning` prop is already available in the parent page component from the API response — no backend changes needed
