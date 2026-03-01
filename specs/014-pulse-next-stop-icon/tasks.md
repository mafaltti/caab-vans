# Tasks: Pulse Animation on Next Stop Icon

**Input**: Design documents from `/specs/014-pulse-next-stop-icon/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not requested in the feature specification. No test tasks included.

**Organization**: US1 (pulse animation) and US2 (reduced motion) are implemented together because they modify the exact same line of code in the same file. US3 requires no code change — it's a verification of existing behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 + 2 — Pulse with Reduced Motion Support (P1 + P2) 🎯 MVP

**Goal**: Add `animate-pulse` to the current stop's inner dot in the schedule timeline, conditionally suppressed when the user prefers reduced motion.

**Independent Test (US1)**: Open a running route's detail page → scroll to "Horários" → the next stop's blue dot should pulse (opacity fading between full and half, ~2s cycle). Past and future stop icons remain static.

**Independent Test (US2)**: Enable "prefers-reduced-motion: reduce" in browser DevTools → reload → the dot should be static (no pulse).

### Implementation

- [x] T001 [US1] [US2] Import `useReducedMotion` from `motion/react` and add conditional `animate-pulse` to current stop inner dot in `src/components/public/schedule-timeline.tsx`
  - Import `useReducedMotion` from `motion/react` (same pattern as `hero-card.tsx:4`)
  - Call `useReducedMotion()` inside `ScheduleTimeline` and pass result as prop to `TimelineNode`
  - In `TimelineNode` for `status === "current"`, add `animate-pulse` to inner dot className when reduced motion is NOT preferred
  - Satisfies: FR-001, FR-002, FR-003, FR-004, FR-005

**Checkpoint**: US1 and US2 are both functional. Running route shows pulsing dot; reduced motion suppresses it.

---

## Phase 2: User Story 3 — No Animation on Inactive Routes (P3)

**Goal**: Confirm that inactive routes display no pulse animation on any stop icon.

**Independent Test**: View an inactive route's schedule timeline → all stop icons should be static (neutral styling, no pulse).

### Verification

- [x] T002 [US3] Verify inactive routes show no animation — no code change needed (existing `deriveTimelineStops` returns `"neutral"` status for all stops when `isRunning === false`, and `TimelineNode` only renders the pulse for `"current"` status)
  - Satisfies: FR-006

**Checkpoint**: All 3 user stories verified.

---

## Phase 3: Polish & Quality Gates

**Purpose**: Ensure the change passes all quality gates before PR.

- [x] T003 Run lint (`eslint`), type-check (`tsc --noEmit`), and build (`next build`)
- [ ] T004 Commit changes with conventional commit message in `src/components/public/schedule-timeline.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1 + US2)**: No prerequisites — single file modification
- **Phase 2 (US3)**: Verification only — can be done alongside Phase 1
- **Phase 3 (Polish)**: Depends on Phase 1 completion

### User Story Dependencies

- **US1 (P1) + US2 (P2)**: Implemented together in T001 — same line of code
- **US3 (P3)**: No code change — verification of existing behavior

### Parallel Opportunities

- T002 (US3 verification) can run in parallel with T001 (implementation) since it requires no code change
- T003 and T004 must be sequential after T001

---

## Implementation Strategy

### MVP First (Single Atomic Change)

1. Complete T001: Add pulse + reduced motion handling
2. **VALIDATE**: Test all 3 user stories visually
3. Complete T003: Run quality gates
4. Complete T004: Commit

### Summary

This feature is a single atomic change to one file. The entire implementation is:
- 1 import added (`useReducedMotion` from `motion/react`)
- 1 hook call added in `ScheduleTimeline`
- 1 prop added to `TimelineNode`
- 1 className conditionally updated (adding `animate-pulse`)

---

## Notes

- US1 and US2 are combined because splitting them into separate tasks would mean modifying the same line twice — violating KISS
- US3 requires zero code changes; the existing `deriveTimelineStops` logic already prevents "current" status on inactive routes
- No new files, no new dependencies — only imports from already-installed packages
- Follow the `hero-card.tsx` pattern for `useReducedMotion` usage
