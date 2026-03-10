# Tasks: Fix Map Staleness

**Input**: Design documents from `/specs/060-fix-map-staleness/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Test update included for the staleness threshold change (existing test must be updated). No new test infrastructure for the tracker app (see research.md R5).

**Organization**: Tasks are grouped by user story. US1 and US2 modify the tracker app. US3 and US4 modify the web app.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 — Stationary Heartbeat (Priority: P1) MVP

**Goal**: Stationary vans send a heartbeat ping every 20 seconds instead of every 60 seconds.

**Independent Test**: Run tracker on a stationary phone, query `van_location_pings` and verify pings arrive every ~20s.

- [x] T001 [US1] Change `STATIONARY_MAX_INTERVAL` from `60_000` to `20_000` in `apps/van-tracker/src/location/task.ts:49`

**Checkpoint**: Stationary vans now send 3 pings/min. Moving vans unaffected.

---

## Phase 2: User Story 2 — Stale Guard Cold Gap Recovery (Priority: P1)

**Goal**: During cold gaps (>2 min since last send), the tracker sends GPS points regardless of age instead of dropping them as stale.

**Independent Test**: Simulate Android doze by pausing location for >2 min, then deliver a 90-second-old GPS point — verify it reaches the server.

- [x] T002 [US2] Modify stale fix guard in `apps/van-tracker/src/location/task.ts:259-265` to skip the stale threshold check when `isColdGap` is true

**Checkpoint**: Van position recovers immediately after Android doze gaps. Normal-operation stale guard still filters bad points.

---

## Phase 3: User Story 3 — Staleness Warning Sooner (Priority: P2)

**Goal**: The "Localização desatualizada" warning appears after 3 minutes instead of 10.

**Independent Test**: Stop tracker, wait 3 minutes, verify amber warning and dimmed marker appear on route page.

- [x] T003 [P] [US3] Change `STALENESS_THRESHOLD_MINUTES` from `10` to `3` in `src/lib/time.ts:13`
- [x] T004 [P] [US3] Update test assertions in `src/__tests__/time/is-location-fresh.test.ts` to reflect 3-minute threshold (change boundary values from 9/10/11 min to 2/3/4 min)

**Checkpoint**: Staleness warning triggers at 3 minutes. Test suite passes with new threshold.

---

## Phase 4: User Story 4 — Last Updated Timestamp (Priority: P2)

**Goal**: Map UI shows a human-readable "last updated" relative time for the van's position.

**Independent Test**: View route page, verify "Última atualização há X min" appears and updates on each poll cycle.

- [x] T005 [US4] Thread `lastGpsFixAt` prop from route data to `VanTrackingMap` component in `src/app/(public)/routes/[routeId]/page.tsx`
- [x] T006 [US4] Add `lastGpsFixAt` prop to `VanTrackingMap` component interface and render a relative timestamp (e.g., "há 30s", "há 2 min") near the existing stale warning area in `src/components/public/van-tracking-map.tsx`

**Checkpoint**: Timestamp visible on map, updates every 5s poll, hidden when van has no location.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T007 Run quality gates: `npx eslint .`, `npx tsc --noEmit`, `npx vitest run`, `npx next build`
- [ ] T008 Manual verification per `specs/060-fix-map-staleness/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)** and **Phase 2 (US2)**: Both modify `task.ts` — execute sequentially (T001 → T002) or combine in single commit
- **Phase 3 (US3)**: Independent — can run in parallel with Phases 1/2 (different codebase: web app vs. tracker)
- **Phase 4 (US4)**: Independent — can run in parallel with Phases 1/2/3 (different files from US3)
- **Phase 5 (Polish)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: No dependencies — start immediately
- **US2 (P1)**: Same file as US1 (`task.ts`) — execute after T001
- **US3 (P2)**: Independent of US1/US2 — parallelizable
- **US4 (P2)**: Independent of US1/US2/US3 — parallelizable

### Parallel Opportunities

- T003 and T004 can run in parallel (different files)
- US3 (T003-T004) and US4 (T005-T006) can run in parallel with US1+US2 (T001-T002)

---

## Parallel Example

```bash
# Batch 1 — all independent, different files:
Task T001: "Change STATIONARY_MAX_INTERVAL in apps/van-tracker/src/location/task.ts"
Task T003: "Change STALENESS_THRESHOLD_MINUTES in src/lib/time.ts"
Task T004: "Update test in src/__tests__/time/is-location-fresh.test.ts"
Task T005: "Thread lastGpsFixAt prop in src/app/(public)/routes/[routeId]/page.tsx"

# Batch 2 — depends on Batch 1:
Task T002: "Modify stale guard in apps/van-tracker/src/location/task.ts" (after T001)
Task T006: "Render timestamp in src/components/public/van-tracking-map.tsx" (after T005)

# Batch 3 — validation:
Task T007: "Run quality gates"
Task T008: "Manual verification"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete T001 + T002 (tracker changes — biggest user impact)
2. **STOP and VALIDATE**: Deploy tracker update, verify ping frequency in production data
3. Continue with US3 + US4 (frontend UX improvements)

### Full Delivery

1. T001 → T002 (tracker: heartbeat + stale guard) — sequentially, same file
2. T003 + T004 + T005 (web: threshold + test + prop threading) — in parallel
3. T006 (web: timestamp display) — after T005
4. T007 + T008 (validation)

---

## Notes

- Total: **8 tasks** across 4 user stories + polish
- US1: 1 task | US2: 1 task | US3: 2 tasks | US4: 2 tasks | Polish: 2 tasks
- US1 and US2 touch the same file (`task.ts`) — combine into a single commit for cleaner diff
- US3 and US4 are pure web-app changes, fully parallel with tracker changes
- No new test files — only updating existing `is-location-fresh.test.ts`
