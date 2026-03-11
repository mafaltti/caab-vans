# Tasks: Schedule Time Split (arrival + departure + sequence)

**Input**: Design documents from `/specs/063-schedule-time-split/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/schedule-api.md

**Tests**: Test fixture updates are included where existing tests reference `time`. No new test files are created (per spec assumptions).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new dependencies required. Existing project structure is sufficient.

- [x] T001 Verify feature branch `063-schedule-time-split` is up-to-date with `dev`

---

## Phase 2: Foundational — US6 Migration (Priority: P1)

**Purpose**: Add new columns, backfill existing data, create bidirectional dual-write trigger. BLOCKS all subsequent work.

**Goal**: Zero-downtime schema migration — new columns coexist with legacy `time`, trigger keeps them in sync.

**Independent Test**: Run migration on local DB, verify all rows have `arrival_time = departure_time = time` and `stop_sequence` reflects chronological order.

- [x] T002 [US6] Write migration `supabase/migrations/00016_schedule_time_split.sql`: add `stop_sequence`, `arrival_time`, `departure_time` columns (nullable initially), backfill from existing `time` (arrival=departure=time, sequence from ROW_NUMBER OVER route_id ORDER BY time), set NOT NULL, add CHECK constraint `departure_time >= arrival_time`, create bidirectional dual-write trigger `sync_schedule_time_fields()`, drop old unique constraint `(route_id, time)`, create new unique constraint `(route_id, stop_sequence)`, drop old index `idx_schedule_entries_route_time`, create new index `idx_schedule_entries_route_sequence`
- [x] T003 [US6] Update `ScheduleEntry` type in `src/types/index.ts` to add `arrival_time`, `departure_time`, `stop_sequence` fields alongside existing `time` (keep `time` for backward compat during transition)
- [x] T004 [US6] Update `scripts/seed-schedule.ts` to include `arrival_time`, `departure_time`, `stop_sequence` in insert payloads (set arrival=departure=time, sequence from array index + 1)

**Checkpoint**: Migration runs cleanly. Legacy writers still work via trigger. `npx tsc --noEmit` passes.

---

## Phase 3: US2 — Admin Reorders Stops Independently of Time (Priority: P1)

**Goal**: Add reorder endpoint, switch ALL sorting from `time` to `stop_sequence` throughout the codebase.

**Independent Test**: Add stops out of chronological order; verify they appear in admin-specified sequence. Reorder via endpoint; verify new order persists.

### Implementation for US2

- [x] T005 [US2] Add `reorderScheduleEntriesSchema` Zod validator in `src/lib/validators/schedule-entry.ts`: `{ entryIds: z.array(z.string().uuid()).min(1) }`
- [x] T006 [US2] Create reorder endpoint `src/app/api/admin/routes/[routeId]/schedule/reorder/route.ts`: PATCH handler validates body, verifies all entry IDs belong to route, bulk-updates `stop_sequence` (1, 2, 3...), returns updated entries per contract
- [x] T007 [US2] Update admin schedule GET in `src/app/api/admin/routes/[routeId]/schedule/route.ts`: change `.order("time")` to `.order("stop_sequence")`, add `stopSequence` to response mapping
- [x] T008 [US2] Update admin schedule POST duplicate check in `src/app/api/admin/routes/[routeId]/schedule/route.ts`: remove time-based duplicate check (uniqueness now on `(route_id, stop_sequence)` enforced by DB constraint)
- [x] T009 [P] [US2] Update public route list API in `src/app/api/routes/route.ts`: change schedule `.order("time")` to `.order("stop_sequence")`
- [x] T010 [P] [US2] Update public route detail API in `src/app/api/routes/[routeId]/route.ts`: change schedule `.order("time")` to `.order("stop_sequence")`, add `stopSequence` to response mapping
- [x] T011 [P] [US2] Update driver routes API in `src/app/api/driver/routes/route.ts`: change schedule sort from `time` to `stop_sequence`
- [x] T012 [P] [US2] Update tracker config API in `src/app/api/tracker-config/[vanId]/route.ts`: change `.order("time")` to `.order("stop_sequence")`
- [x] T013 [P] [US2] Update start route API in `src/app/api/routes/[routeId]/start/route.ts`: change schedule sort from `time` to `stop_sequence`
- [x] T014 [P] [US2] Update confirm-start-stop API in `src/app/api/routes/[routeId]/confirm-start-stop/route.ts`: change schedule sort/filter from `time` to `stop_sequence`
- [x] T015 [US2] Update `src/components/admin/schedule-editor.tsx`: replace both `.sort((a, b) => a.time.localeCompare(b.time))` calls with `.sort((a, b) => a.stopSequence - b.stopSequence)`
- [x] T016 [P] [US2] Update `scripts/simulate-tracking.ts`: replace `.sort((a, b) => a.time.localeCompare(b.time))` with sort by `stop_sequence`
- [x] T017 [P] [US2] Update `scripts/precompute-stop-distances.ts`: change SQL `ORDER BY r.id, se.time` to `ORDER BY r.id, se.stop_sequence`
- [x] T018 [P] [US2] Update `scripts/reconcile-orphaned-shifts.ts`: replace `.map(e => e.time).sort().at(-1)` with sort by `stop_sequence` and use `arrival_time` for max scheduled time
- [x] T019 [US2] Update test fixtures in tracking test files to add `stop_sequence: N` field alongside existing `time` in all schedule entry mocks (do NOT rename `time` yet — that happens in Phase 5 T032-T044)

**Checkpoint**: All sorting uses `stop_sequence`. Reorder endpoint works. `npx tsc --noEmit && npx vitest run && npm run build` passes.

---

## Phase 4: US1 — Admin Manages Arrival and Departure Times (Priority: P1) 🎯 MVP

**Goal**: Admin can set separate arrival and departure times per stop. Validators enforce `departure >= arrival`.

**Independent Test**: Create a schedule entry with arrival "07:00" and departure "07:05" via admin editor. Verify both times persist and display. Try departure before arrival; verify rejection.

### Implementation for US1

- [x] T020 [US1] Update Zod validators in `src/lib/validators/schedule-entry.ts`: replace `time` field with `arrivalTime` + `departureTime` (both HH:mm regex), add `.refine(d => d.departureTime >= d.arrivalTime, "Departure must not be before arrival")` to both create and update schemas
- [x] T021 [US1] Update admin schedule POST in `src/app/api/admin/routes/[routeId]/schedule/route.ts`: write `arrival_time` and `departure_time` instead of `time` in insert payload, map response to include `arrivalTime`, `departureTime`
- [x] T022 [US1] Update admin schedule PUT in `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts`: write `arrival_time` and `departure_time` instead of `time` in update payload, map response to include `arrivalTime`, `departureTime`
- [x] T023 [US1] Update `src/components/admin/schedule-editor.tsx`: replace single time `<Input>` with two inputs (arrival time, departure time), update local state from `newTime`/`editTime` to `newArrivalTime`/`newDepartureTime` + `newDepartureTime`/`editDepartureTime`, update entry data structure, add client-side validation feedback for departure < arrival
- [x] T024 [US1] Update `scripts/seed-schedule.ts`: change insert data to use `arrival_time` and `departure_time` directly instead of relying on trigger (set both equal to the existing time value)

**Checkpoint**: Admin creates/edits entries with separate arrival/departure. Validation rejects departure < arrival. `npx tsc --noEmit && npx vitest run && npm run build` passes.

---

## Phase 5: US4 — Tracking System Uses Correct Time Field (Priority: P2)

**Goal**: Apply semantic mapping: SORT→`stopSequence`, ARRIVAL→`arrivalTime`, DEPARTURE→`departureTime` across all tracking core files.

**Independent Test**: Run tracking test suite with schedule entries that have divergent arrival/departure times. Verify ETA targets arrival, time-floor uses departure, ordering uses sequence.

### Implementation for US4

- [x] T025 [US4] Update `src/lib/time.ts`: in `isWithinScheduleWindow()` change to use first stop's `departure_time` and last stop's `arrival_time` for window boundaries, sort by `stop_sequence`; in `getNextStop()` sort by `stop_sequence`, compare against `departure_time` for time-floor filtering
- [x] T026 [US4] Update `src/lib/tracking/eta.ts` (~15 refs): replace 4 `.sort()` calls to use `stopSequence`, change time-floor filter `s.time >= timeFloor` to use `departureTime`, change delay computation `parseTime(lastPassed.time)` to use `arrivalTime`, change ETA baseline `parseTime(nextStop.time)` to use `arrivalTime`, change overdue check `nextStop.time.split(":")` to use `arrivalTime`, update local Stop interface type
- [x] T027 [US4] Update `src/lib/tracking/infer-stop-progress.ts` (~10 refs): replace `.order("time")` with `.order("stop_sequence")`, replace JS sorts to use `stop_sequence`, change `stopDateTime(entry.time)` calls to use `arrival_time` for closest-in-time and `departure_time` for early-arrival window, update backfill gate comparison to use `stop_sequence`
- [x] T028 [US4] Update `src/lib/tracking/process-device-geofence-events.ts` (~5 refs): replace JS sort to use `stop_sequence`, change `stopDateTime(entry.time)` to use `departure_time` for early-arrival window and `arrival_time` for closest-in-time disambiguation
- [x] T029 [US4] Update `src/lib/tracking/resolve-route-progress.ts` (~6 refs): replace `[...times].sort()` with sort by `stop_sequence`, change schedule window check to use first `departure_time` and last `arrival_time`, update time extraction from embedded schedule_entries to use `arrival_time`, update local ScheduleEntry interface
- [x] T030 [US4] Update `src/lib/tracking/suggest-start-stop.ts` (~9 refs): replace time parsing to use `departure_time` for cold-start window check (`stopTime <= now.plus(TIME_WINDOW_MINUTES)`), sort candidates by sequence or time distance using `departure_time`, update local interface and suggestion passthrough
- [x] T031 [US4] Update `src/lib/tracking/seed-route-run-stops.ts` (~2 refs): read from new fields when seeding route_run_stops from schedule entries
- [x] T032 [US4] Update test fixtures in `src/__tests__/tracking/eta.test.ts` (~20 refs): replace `time` with `arrivalTime`/`departureTime` in schedule entry mocks, add divergent arrival/departure cases to verify correct field usage
- [x] T033 [P] [US4] Update test fixtures in `src/__tests__/tracking/infer-stop-progress.test.ts` (~25 refs): replace `time` in mocks, verify geofence matching uses correct fields
- [x] T034 [P] [US4] Update test fixtures in `src/__tests__/tracking/process-device-geofence-events.test.ts` (~15 refs): replace `time` in mocks
- [x] T035 [P] [US4] Update test fixtures in `src/__tests__/tracking/resolve-route-progress.test.ts` (~25 refs): replace `time` in mocks
- [x] T036 [P] [US4] Update test fixtures in `src/__tests__/tracking/resolve-route-progress-idle.test.ts` (~12 refs): replace `time` in mocks
- [x] T037 [P] [US4] Update test fixtures in `src/__tests__/tracking/resolve-route-progress-modes.test.ts` (~12 refs): replace `time` in mocks
- [x] T038 [P] [US4] Update test fixtures in `src/__tests__/tracking/tracker-config.test.ts` (~8 refs): replace `time` in mocks
- [x] T039 [P] [US4] Update test fixtures in `src/__tests__/tracking/routes-api.test.ts` (~15 refs): replace `time` in mocks
- [x] T040 [P] [US4] Update test fixtures in `src/__tests__/tracking/time-factors.test.ts` (~10 refs): replace `time` in mocks if applicable
- [x] T041 [P] [US4] Update test fixtures in `src/__tests__/tracking/resolve-next-stop.test.ts` (~6 refs): replace `time` in mocks
- [x] T042 [P] [US4] Update test fixtures in `src/__tests__/tracking/reconcile-orphaned-shifts.test.ts` (~12 refs): replace `time` in mocks
- [x] T043 [P] [US4] Update test fixtures in `src/__tests__/lib/tracking/confirm-start-stop.test.ts` (~10 refs): replace `time` in mocks
- [x] T044 [P] [US4] Update test fixtures in `src/__tests__/lib/tracking/suggest-start-stop.test.ts` (~15 refs): replace `time` in mocks

**Checkpoint**: All tracking tests pass with new fields. No regression in ETA, geofence, delay. `npx tsc --noEmit && npx vitest run` passes.

---

## Phase 6: US3 + US5 — Commuter and Driver Views (Priority: P2)

**Goal**: Public components show `arrivalTime` beside ETA. Timeline shows time range when arrival != departure. Driver view shows both times.

**Independent Test**: View a route with stops having different arrival/departure. Verify hero card shows arrival, timeline shows range, driver card shows both.

### Implementation for US3 (Commuter Views)

- [x] T045 [US3] Update `NextStop` type in `src/types/index.ts`: replace `time: string` with `arrivalTime: string` and `departureTime: string`
- [x] T046 [US3] Update `RouteDetail.schedule[]` type in `src/types/index.ts`: replace `time: string` with `arrivalTime: string`, `departureTime: string`, `stopSequence: number`
- [x] T047 [US3] Update `TimelineStop` type in `src/types/index.ts`: replace `time: string` with `arrivalTime: string` and `departureTime: string`
- [x] T048 [US3] Update public route list API response in `src/app/api/routes/route.ts`: map schedule entries to return `arrivalTime`, `departureTime`, `stopSequence` instead of `time`; map `nextStop` to return `arrivalTime`, `departureTime` instead of `time`
- [x] T049 [US3] Update public route detail API response in `src/app/api/routes/[routeId]/route.ts`: map schedule entries and nextStop to return new fields instead of `time`
- [x] T050 [US3] Update `src/components/public/hero-card.tsx`: replace `nextStop.time` with `nextStop.arrivalTime` in display beside ETA
- [x] T051 [US3] Update `src/components/public/route-card.tsx`: replace `route.nextStop.time` with `route.nextStop.arrivalTime`
- [x] T052 [US3] Update `src/components/public/schedule-timeline.tsx`: replace `stop.time` display with `stop.arrivalTime`; when `arrivalTime !== departureTime`, show as range "HH:mm - HH:mm"; update past/future comparison from `entry.time < serverTime` to `entry.arrivalTime < serverTime`
- [x] T053 [US3] Update `src/app/(public)/routes/[routeId]/page.tsx`: replace identity match `s.time === route.nextStop!.time` with `s.id === route.nextStop!.id` (FR-010); update `scheduledTime` prop passed to route-detail-peek to use `route.nextStop.arrivalTime`
- [x] T054 [P] [US3] Update test fixtures in `src/__tests__/components/schedule-timeline.test.ts` (~12 refs): replace `time` with `arrivalTime`/`departureTime`, add case for time range display
- [x] T055 [P] [US3] Update test fixtures in `src/__tests__/components/route-detail-eta.test.ts` (~6 refs): replace `time` in mocks
- [x] T056 [P] [US3] Update test fixtures in `src/__tests__/components/route-card-eta.test.ts` (~6 refs): replace `time` in mocks

### Implementation for US5 (Driver Views)

- [x] T057 [US5] Update driver routes API in `src/app/api/driver/routes/route.ts`: map schedule entries to return `arrivalTime` and `departureTime` instead of `time`
- [x] T058 [US5] Update `src/components/driver/route-card.tsx`: replace `stop.time` with `stop.arrivalTime`; when `arrivalTime !== departureTime`, also show departure as "leave by" label; hide redundant departure when equal

**Checkpoint**: All public and driver views show correct times. Timeline shows ranges. Identity match uses `id`. `npx tsc --noEmit && npx vitest run && npm run build` passes.

---

## Phase 7: US7 — Legacy Time Column Cleanup (Priority: P3)

**Goal**: Remove the `time` column, dual-write trigger, and all remaining references.

**Independent Test**: Drop column, verify no code references `time` — all tests pass, build succeeds.

- [x] T059 [US7] Write migration `supabase/migrations/00017_drop_legacy_time.sql`: drop trigger `trg_sync_schedule_times`, drop function `sync_schedule_time_fields()`, drop column `time` from `schedule_entries`
- [x] T060 [US7] Remove `time` field from `ScheduleEntry` type in `src/types/index.ts`
- [x] T061 [US7] Search codebase for any remaining references to legacy `time` field on schedule entries (grep for `.time` on schedule-related variables, `"time"` in schedule queries) and remove them

**Checkpoint**: No `time` references remain. `npx tsc --noEmit && npx vitest run && npm run build` passes cleanly.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and cleanup across all stories.

- [x] T062 Run full quality gates: `npx eslint . && npx tsc --noEmit && npx vitest run && npm run build`
- [x] T063 Verify seed script runs without errors on a fresh database with new migration
- [x] T064 Run quickstart.md verification checklist (admin editor shows correct fields, public page shows correct times beside ETA)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational - US6)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US2 - Reorder)**: Depends on Phase 2 — switches all sorting to stop_sequence
- **Phase 4 (US1 - Admin)**: Depends on Phase 3 — admin CRUD writes new fields, editor gets two inputs
- **Phase 5 (US4 - Tracking)**: Depends on Phase 3 — tracking core applies semantic mapping
- **Phase 6 (US3+US5 - Views)**: Depends on Phase 5 — public/driver views consume API changes
- **Phase 7 (US7 - Cleanup)**: Depends on Phases 4, 5, 6 — all writers/consumers migrated
- **Phase 8 (Polish)**: Depends on Phase 7 — final verification

### User Story Dependencies

```
US6 (Migration) ──→ US2 (Reorder) ──→ US1 (Admin) ──┐
                          │                           │
                          └──→ US4 (Tracking) ────────┤
                                                      ├──→ US7 (Cleanup)
                               US3 (Commuter) ←──────┤
                               US5 (Driver)   ←──────┘
```

- **US6**: No story dependencies — foundational
- **US2**: Depends on US6 — needs new columns to exist
- **US1**: Depends on US2 — admin editor needs sequence-based sorting before adding two time inputs
- **US4**: Depends on US2 — tracking must use stop_sequence for ordering
- **US3**: Depends on US4 — public API needs tracking changes (types flow from tracking to API to UI)
- **US5**: Depends on US4 — same as US3
- **US7**: Depends on US1 + US4 + US3 + US5 — all must be migrated before dropping legacy

### Parallel Opportunities

**Within Phase 3 (US2)**: T009, T010, T011, T012, T013, T014 can all run in parallel (different API route files)

**Within Phase 3 (US2)**: T016, T017, T018 can run in parallel (different script files)

**Within Phase 5 (US4)**: T033–T044 (test fixture updates) can all run in parallel (different test files)

**Within Phase 6**: T054, T055, T056 can run in parallel (different test files)

**US3 and US5 can run in parallel** within Phase 6 (different components, different API routes)

---

## Parallel Example: Phase 3 (US2)

```bash
# Launch API route updates in parallel (different files):
Task: T009 "Update public route list API sort in src/app/api/routes/route.ts"
Task: T010 "Update public route detail API sort in src/app/api/routes/[routeId]/route.ts"
Task: T011 "Update driver routes API sort in src/app/api/driver/routes/route.ts"
Task: T012 "Update tracker config API sort in src/app/api/tracker-config/[vanId]/route.ts"
Task: T013 "Update start route API sort in src/app/api/routes/[routeId]/start/route.ts"
Task: T014 "Update confirm-start-stop API sort in src/app/api/routes/[routeId]/confirm-start-stop/route.ts"
```

## Parallel Example: Phase 5 (US4)

```bash
# Launch test fixture updates in parallel (different test files):
Task: T033 "Update infer-stop-progress test fixtures"
Task: T034 "Update process-device-geofence test fixtures"
Task: T035 "Update resolve-route-progress test fixtures"
Task: T036 "Update resolve-route-progress-idle test fixtures"
Task: T037 "Update resolve-route-progress-modes test fixtures"
Task: T038 "Update tracker-config test fixtures"
Task: T039 "Update routes-api test fixtures"
Task: T040 "Update time-factors test fixtures"
Task: T041 "Update resolve-next-stop test fixtures"
Task: T042 "Update reconcile-orphaned-shifts test fixtures"
Task: T043 "Update confirm-start-stop test fixtures"
Task: T044 "Update suggest-start-stop test fixtures"
```

---

## Implementation Strategy

### MVP First (P1 Stories: US6 + US2 + US1)

1. Complete Phase 2: Migration (US6) — columns exist, trigger syncs
2. Complete Phase 3: Reorder (US2) — all sorting uses stop_sequence
3. Complete Phase 4: Admin (US1) — admin writes arrival/departure
4. **STOP and VALIDATE**: Admin can create/edit entries with two times, reorder stops
5. All existing behavior preserved via trigger + sequence ordering

### Incremental Delivery

1. Migration + Reorder + Admin → Foundation ready, admin can use new fields
2. Add Tracking Core (US4) → Tracking uses correct semantics, tests prove no regression
3. Add Commuter + Driver Views (US3 + US5) → All UIs updated
4. Cleanup (US7) → Legacy removed
5. Each phase adds value and can be deployed independently

### Single Developer Strategy (Sequential)

Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Each phase ends with a passing quality gate checkpoint.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Test fixture updates are listed per file because each has ~6-25 `time` references requiring careful semantic mapping
- The highest-risk phase is Phase 5 (tracking core) — 63 time references across 6 files. Each file should be committed separately after its tests pass.
- Commit after each task or logical group
- Stop at any checkpoint to validate and deploy independently
