# Tasks: Fix ETA & Next Stop Time-Awareness

**Input**: Design documents from `/specs/019-fix-eta-next-stop/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — plan.md Constitution Check explicitly states unit tests for `computeEta` and `deriveTimelineStops`.

**Organization**: US1 (timeline fix) and US2 (ETA computation) share the same server-side files and are implemented together. US3 (hero card ETA) requires no code change — it's automatically resolved when US1+US2 make the next stop IDs agree.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Server-Side Bug Fixes (US1 + US2, Priority: P1) 🎯 MVP

**Goal**: Fix `computeEta` and `inferStopProgress` so the API returns the correct time-aware next stop and realistic ETA values.

**Independent Test**: Call `GET /api/routes/[routeId]` for a route with GPS tracking started mid-day. Verify `progress.nextStopId` points to a future stop (not CAAB @ 00:00) and `etaNextStopMinutes` is a positive realistic value.

### Implementation

- [x] T001 [P] [US2] Add time-aware pending stop filter in `computeEta` — derive `nowHHmm` from the existing `now` DateTime parameter, filter `pending` array to only stops with `time >= nowHHmm` before sorting, and return null ETA result when all pending stops are in the past `src/lib/tracking/eta.ts`
- [x] T002 [P] [US1] Add time-aware nextStopId selection in `inferStopProgress` result-building loop (step 7) — derive `nowHHmm` from `nowBahia()`, only assign `nextStopId` from pending stops whose `schedule_entries.time >= nowHHmm` `src/lib/tracking/infer-stop-progress.ts`

### Tests

- [x] T003 [P] [US2] Add unit tests for `computeEta` time-aware filtering: (1) mid-day start picks correct future stop, (2) all-past pending stops returns null ETA, (3) no regression when all stops are future, (4) existing passed stops still counted correctly `src/lib/tracking/__tests__/eta.test.ts`

**Checkpoint**: API returns correct `nextStopId` and `etaNextStopMinutes` for mid-day tracking scenarios

---

## Phase 2: Timeline UI Fix (US1, Priority: P1)

**Goal**: Fix `deriveTimelineStops` to classify un-geofenced past-time stops as "past" using hybrid time+GPS logic, and pass `serverTime` from the API response into the timeline component.

**Independent Test**: Open route detail page with active GPS tracking started mid-day. Timeline should show morning stops as "past" (not "future"), and the correct upcoming stop as "current" with blue indicator.

### Implementation

- [x] T004 [US1] Update `deriveTimelineStops` to accept `serverTime` parameter and implement hybrid classification — in the GPS branch (`passedStopIds.length > 0`), mark a stop as "past" if `passedSet.has(entry.id) || entry.time < serverTime`, and only mark as "current" if `entry.id === inferredNextStopId`. Update `ScheduleTimelineProps` type to include `serverTime?: string` `src/components/public/schedule-timeline.tsx`
- [x] T005 [US1] Pass `serverTime` prop from API response to `<ScheduleTimeline>` component — use `data?.serverTime` from the query hook response `src/app/(public)/routes/[routeId]/page.tsx`

### Tests

- [x] T006 [P] [US1] Add unit tests for `deriveTimelineStops` hybrid classification: (1) un-geofenced past-time stops classified as "past", (2) GPS-confirmed passed stops still classified as "past", (3) correct stop marked as "current" with time >= serverTime, (4) no-GPS fallback unchanged, (5) not-running state returns all "neutral" `src/__tests__/components/schedule-timeline.test.ts`

**Checkpoint**: Timeline correctly shows hybrid time+GPS stop classification for all scenarios

---

## Phase 3: Hero Card ETA Verification (US3, Priority: P2)

**Goal**: Confirm that the hero card displays ETA when GPS-based and time-based next stop IDs agree (no code change needed — automatic once US1+US2 are correct).

- [x] T007 [US3] Verify hero card ETA display works — the existing conditional `nextStop.id === progress.nextStopId` in page.tsx (line 101) will now evaluate to `true` since both point to the same future stop. No code change required; verify by manual inspection or automated test that `etaMinutes` prop is passed to HeroCard `src/app/(public)/routes/[routeId]/page.tsx`

**Checkpoint**: Hero card and schedule timeline agree on next stop, ETA visible in both

---

## Phase 4: Polish & Quality Gates

**Purpose**: Final validation across all stories

- [x] T008 Run quality gates: lint (`npx eslint .`), typecheck (`npx tsc --noEmit`), build (`npx next build`), tests (`npx vitest run`)
- [ ] T009 Run quickstart.md manual validation scenario (requires running server + GPS tracking) (full-day route with mid-day GPS tracking)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Server-Side)**: No dependencies — can start immediately
- **Phase 2 (Timeline UI)**: Independent of Phase 1 (different files, different layer)
- **Phase 3 (Hero Card)**: Depends on Phase 1 + Phase 2 (needs both fixes to verify)
- **Phase 4 (Polish)**: Depends on all phases complete

### Task Dependencies

```
T001 ──┬──→ T003 (test after impl)
       │
T002 ──┤
       ├──→ T007 (verify hero card needs both server fixes + UI fix)
T004 ──┤
  │    │
  └──→ T005 (page needs updated component type)
       │
T006 ──┘──→ T008, T009 (quality gates after all tasks)
```

### Parallel Opportunities

**Round 1** (3 tasks in parallel — all different files):
- T001: `src/lib/tracking/eta.ts`
- T002: `src/lib/tracking/infer-stop-progress.ts`
- T004: `src/components/public/schedule-timeline.tsx`

**Round 2** (3 tasks in parallel — all different files):
- T003: `src/lib/tracking/__tests__/eta.test.ts`
- T005: `src/app/(public)/routes/[routeId]/page.tsx`
- T006: `src/__tests__/components/schedule-timeline.test.ts`

**Round 3** (sequential):
- T007: Verify hero card (depends on all fixes)
- T008: Quality gates
- T009: Manual validation

---

## Implementation Strategy

### MVP First (Phase 1 Only)

1. Complete T001 + T002 (server-side fixes)
2. **STOP and VALIDATE**: API returns correct nextStopId and ETA
3. This alone fixes the worst symptom (0 min ETA for past stops)

### Full Fix (Phase 1 + Phase 2)

1. Complete T001 + T002 + T004 + T005 (all code changes)
2. Complete T003 + T006 (unit tests)
3. Verify T007 (hero card auto-fix)
4. Run T008 + T009 (quality gates)
5. One PR targeting `dev`

### Optimal Parallel Execution

With maximum parallelism, the fix completes in 3 rounds:
- **Round 1**: T001 + T002 + T004 (all implementation, ~15 min)
- **Round 2**: T003 + T005 + T006 (tests + page prop, ~15 min)
- **Round 3**: T007 + T008 + T009 (verify + gates, ~10 min)

---

## Notes

- T007 requires no code change — it's a verification that the existing hero card conditional now works correctly
- All server-side time filtering uses `HH:mm` string comparison (lexicographic = chronologic for same-day routes)
- Both `computeEta` and `inferStopProgress` derive `nowHHmm` from their existing time source (no new parameters needed)
- Only `deriveTimelineStops` gets a new parameter (`serverTime`) since it's a client-side function
- Commit after each logical group (server fixes, UI fixes, tests)
