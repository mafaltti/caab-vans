# Tasks: Last-Known Progress Display

**Input**: Design documents from `/specs/055-last-known-client-wiring/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Included — spec defines a testing strategy and plan Phase F specifies test cases.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Foundational (Data Wiring)

**Purpose**: Wire `includeLastKnown=true` into data-fetching hooks so backend returns last-known progress data for non-running routes. All user stories depend on this.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 [P] Append `?includeLastKnown=true` to the fetch URL in `src/lib/queries/use-routes.ts` (change `/api/routes` → `/api/routes?includeLastKnown=true`)
- [x] T002 [P] Append `?includeLastKnown=true` to the fetch URL in `src/lib/queries/use-route-detail.ts` (change `` `/api/routes/${routeId}` `` → `` `/api/routes/${routeId}?includeLastKnown=true` ``)

**Checkpoint**: Both hooks now request last-known data. Running routes are unaffected (backend ignores the flag for running routes). Verify with browser devtools that API responses include `nextStopMode` and `passedStopIds` for non-running routes with persisted progress.

---

## Phase 2: User Story 1 — Commuter Sees Last-Known Progress (Priority: P1) MVP

**Goal**: Non-running routes with persisted progress show the last-known stop in the route card and passed/current/future stops in the timeline.

**Independent Test**: End a route that has progressed past several stops, then view the route list and route detail as a commuter. The route card should show the last stop name with a progress counter, and the timeline should show passed/current/future stops instead of all-neutral.

### Implementation for User Story 1

- [x] T003 [US1] In `src/components/public/schedule-timeline.tsx`, reorder `deriveTimelineStops()` branches: move the `passedStopIds.length > 0` check (currently line ~51) above the `!isRunning` catch-all (currently line ~44). The new order must be: (1) waiting → all neutral, (2) completed → all past, (3) passedStopIds → derive states, (4) !isRunning → all neutral catch-all, (5) !nextStopId → all past, (6) nextStopId fallback. Ensure `deriveTimelineStops` is still exported for testing.
- [x] T004 [US1] In `src/components/public/route-card.tsx`, add a conditional label when `route.nextStopMode === "last_known"` in the nextStop rendering block (line ~56). Display "Última posição" as a small text prefix above or beside the stop name. No structural changes to ETA gating or progress counter — they already work correctly with the new data.
- [x] T005 [US1] In `src/components/public/schedule-timeline.tsx`, add `nextStopMode?: "live" | "last_known" | null` to `ScheduleTimelineProps` (line ~9-19). This prop is used only for rendering (Phase 4/US3), not for `deriveTimelineStops` logic. Accept and pass it through for now.
- [x] T006 [US1] In `src/app/(public)/routes/[routeId]/page.tsx`, add `nextStopMode={route!.nextStopMode}` to both `<ScheduleTimeline>` calls (sheet layout line ~240 and card layout line ~280). Depends on T005.

### Tests for User Story 1

- [x] T007 [US1] In `src/__tests__/components/schedule-timeline.test.ts`, update the existing test "returns all neutral when not running" (line ~162): when `isRunning=false` AND `passedStopIds` is populated AND no `runStatus` override, `deriveTimelineStops` should now return derived states (past/current/future) instead of all-neutral. Update the assertion to match the new expected behavior.
- [x] T008 [P] [US1] In `src/__tests__/components/schedule-timeline.test.ts`, add a new test: "derives past/current/future for non-running route with passedStopIds". Call `deriveTimelineStops(schedule, null, false, ["stop-2200"], "stop-2240", "22:35")` and assert stops before the passed stop are past, the inferred next stop is current, and remaining stops are future.
- [x] T009 [P] [US1] In `src/__tests__/components/schedule-timeline.test.ts`, add a new test: "still returns all-neutral for runStatus=waiting even with passedStopIds". Call `deriveTimelineStops(schedule, null, false, ["stop-2200"], "stop-2240", "22:35", "waiting")` and assert all stops are neutral.
- [x] T010 [P] [US1] In `src/__tests__/components/schedule-timeline.test.ts`, add a new test: "still returns all-past for runStatus=completed". Call `deriveTimelineStops(schedule, null, false, ["stop-2200"], "stop-2240", "22:35", "completed")` and assert all stops are past.

**Checkpoint**: Route card shows last-known stop name with "Última posição" label and progress counter. Timeline shows passed/current/future for non-running routes with progress data. All existing and new timeline tests pass.

---

## Phase 3: User Story 2 — Muted Hero Card with Last-Known Position (Priority: P2)

**Goal**: The route detail hero card shows a muted gray card with "Última posição conhecida", stop name, and time for non-running routes with last-known data.

**Independent Test**: End a route mid-progress and view the route detail page. The hero card should display a gray card with the last-known stop info instead of the generic "Fora de operação" or blank card.

### Implementation for User Story 2

- [x] T011 [US2] In `src/components/public/hero-card.tsx`, add `nextStopMode?: "live" | "last_known" | null` to the `HeroCardProps` interface (line ~7-16).
- [x] T012 [US2] In `src/components/public/hero-card.tsx`, insert a new early-return branch after the `runStatus === "completed"` check (line ~50) and before the `runStatus === "in_progress" && !isRunning` check (line ~53). Condition: `!isRunning && nextStopMode === "last_known" && nextStop`. Render a muted gray card (`bg-zinc-100`) with: MapPin icon (`text-zinc-400`), "Última posição conhecida" (`text-zinc-600`), `nextStop.stopName` (`text-zinc-800`), and `às ${nextStop.time}` (`text-zinc-400`). No ETA, no GPS timestamp.
- [x] T013 [US2] In `src/app/(public)/routes/[routeId]/page.tsx`, add `nextStopMode={route!.nextStopMode}` to the `<HeroCard>` call (line ~256).

**Checkpoint**: Hero card shows muted gray "Última posição conhecida" card for non-running routes with last-known data. No ETA or GPS info shown. Running routes and completed routes render identically to before.

**Manual verification**: Start a route, advance past 2 stops, end the shift. Verify muted hero card appears. Start a new shift — verify hero card switches to live mode within one polling cycle (5s).

---

## Phase 4: User Story 3 — Visual Distinction Between Live and Last-Known (Priority: P3)

**Goal**: Last-known progress uses visually distinct styling across all components — gray dot (no pulse) in timeline, explicit labels in route card.

**Independent Test**: Compare the same route in running vs. non-running-with-last-known states. Timeline current marker should be gray (no pulse) for last-known vs. blue (pulsing) for live. Route card label should say "Última posição" for last-known.

### Implementation for User Story 3

- [x] T014 [US3] In `src/components/public/schedule-timeline.tsx`, modify the `TimelineNode` rendering for `status === "current"` (line ~107-113). When `nextStopMode === "last_known"`, render a gray dot (`border-zinc-400 bg-zinc-400`) without pulse animation instead of the blue pulsing dot (`border-blue-500`). The `nextStopMode` prop was added in T005. Also update the "Próxima parada" label (line ~198-207) to show "Última posição" when `nextStopMode === "last_known"`.

### Tests for User Story 3

- [x] T015 [P] [US3] Create `src/__tests__/components/route-card-last-known.test.ts`. Using the pure function extraction pattern (like `route-card-eta.test.ts`), extract a `getNextStopLabel(nextStopMode)` helper and test: returns "Última posição" when `nextStopMode === "last_known"`, returns default/null when `nextStopMode === "live"` or `null`.

**Checkpoint**: Timeline current marker is gray without pulse for last-known. Route card explicitly labels last-known stops. Visual regression: running routes still show blue pulsing dot and default labels.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T016 Run `npx eslint .` and fix any lint errors introduced
- [x] T017 Run `npx tsc --noEmit` and fix any type errors
- [x] T018 Run `npx next build` and verify build succeeds
- [x] T019 Run `npx vitest run` and verify all tests pass (existing + new)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately. T001 and T002 run in parallel.
- **US1 (Phase 2)**: Depends on Phase 1 completion. T003 and T004 can run in parallel. T006 depends on T005. T007-T010 depend on T003.
- **US2 (Phase 3)**: Depends on Phase 1 completion. Can run in parallel with US1. T012 depends on T011. T013 depends on T011 (HeroCard must accept `nextStopMode` prop before parent can pass it).
- **US3 (Phase 4)**: Depends on US1 (T005 adds `nextStopMode` prop to timeline). T014 depends on T005. T015 can run in parallel with T014.
- **Polish (Phase 5)**: Depends on all previous phases.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. Can start immediately after Phase 1.
- **US2 (P2)**: Depends only on Foundational. Can run in parallel with US1.
- **US3 (P3)**: Depends on US1 (needs `nextStopMode` prop in timeline from T006).

### Parallel Opportunities

- T001 + T002 (both hooks) — different files
- T003 + T004 (timeline reorder + route card label) — different files
- T008 + T009 + T010 (new timeline test cases) — same file but independent tests
- US1 + US2 can proceed in parallel after Phase 1
- T014 + T015 (timeline styling + route card test) — different files

---

## Parallel Example: User Story 1

```bash
# After Phase 1 completes, launch in parallel:
Task T003: "Reorder deriveTimelineStops branches in schedule-timeline.tsx"
Task T004: "Add last-known label in route-card.tsx"

# Then sequentially:
Task T005: "Add nextStopMode prop to ScheduleTimelineProps"
Task T006: "Thread nextStopMode to ScheduleTimeline in page.tsx"

# Tests in parallel:
Task T008: "Test non-running route with passedStopIds"
Task T009: "Test waiting status overrides passedStopIds"
Task T010: "Test completed status returns all-past"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Wire `?includeLastKnown=true` in both hooks
2. Complete Phase 2: Timeline branch reorder + route card label
3. **STOP and VALIDATE**: Non-running routes with progress show last-known data in card and timeline
4. This alone solves the core problem for commuters

### Incremental Delivery

1. Phase 1 → Data flows from backend
2. Phase 2 (US1) → Route card + timeline show last-known (MVP!)
3. Phase 3 (US2) → Hero card shows muted last-known card
4. Phase 4 (US3) → Visual polish (gray dot, explicit labels)
5. Phase 5 → Quality gates pass, ready for PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The `nextStopMode` field already exists in `RouteWithStatus` type — no type changes needed
- Commit after each phase for clean git history
- The existing test "returns all neutral when not running" (T007) must be updated BEFORE new tests are added to avoid confusion

## Post-Implementation: Review-Driven Fixes

The following additional tasks were identified during PR review and implemented after the initial task plan:

- [x] T020 In `src/app/api/routes/route.ts` and `src/app/api/routes/[routeId]/route.ts`, add `progress.runStatus !== "waiting"` guard to the last-known population block. Prevents waiting routes from showing stale progress.
- [x] T021 In `src/lib/tracking/resolve-route-progress.ts`, null `etaNextStopMinutes` and `etaNextStopISO` alongside `nextStopId` in the stale-pointer safeguard (line ~280). Prevents leaked ETA for invalid pointers.
- [x] T022 In `src/components/public/route-card.tsx` and `src/components/public/schedule-timeline.tsx`, add `nextStopMode !== "last_known"` guard to ETA rendering blocks. Defense-in-depth against ETA display in last-known mode.
- [x] T023 In `src/__tests__/tracking/routes-api.test.ts`, add 6 tests for waiting-route last-known suppression logic (pure function extraction mirroring route handler gate).
- [x] T024 In `src/__tests__/tracking/resolve-route-progress-idle.test.ts`, strengthen idle test to assert `etaNextStopMinutes` and `etaNextStopISO` are null when pointer is stale.
