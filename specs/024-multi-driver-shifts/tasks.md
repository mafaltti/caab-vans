# Tasks: Multi-Driver Shift Support

**Input**: Design documents from `/specs/024-multi-driver-shifts/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api-contracts.md, research.md, quickstart.md

**Tests**: No test tasks included (not explicitly requested in feature specification).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US1 and US3 are combined into a single phase because they are tightly coupled (starting and ending shifts form one indivisible lifecycle).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and TypeScript type updates that all user stories depend on

- [x] T001 Create migration file with new tables, data migration, and column drops in `supabase/migrations/00004_multi_driver_shifts.sql` — include `van_drivers` table (composite PK), `route_shifts` table (UUID PK), indexes, RLS, data migration from `vans.driver_id` → `van_drivers` and `route_runs.started_at/ended_at` → `route_shifts`, then drop deprecated columns (per `data-model.md`)
- [x] T002 Update TypeScript types in `src/types/index.ts` — remove `driver_id` from `Van`, remove `started_at`/`ended_at` from `RouteRun`, add `"idle"` to `RunStatus`, add `RouteShift` and `VanDriver` types, update `RouteProgress` (`startedAt` → `shiftStartedAt`), update `DriverRoute` (add `activeShift`, `todayShifts`, simplify `run`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core shared libraries that MUST be updated before ANY user story endpoint can work correctly

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Rewrite `deriveRunStatus` in `src/lib/tracking/run-status.ts` — change signature from `(startedAt, endedAt)` to `(shifts: { ended_at: string | null }[], isPastScheduleWindow: boolean)`, implement four-state logic: `waiting` (no shifts) → `in_progress` (active shift) → `idle` (all ended, window open) → `completed` (all ended, window passed) per `data-model.md` derivation table
- [x] T004 [P] Update `computeEta` call sites in `src/lib/tracking/eta.ts` — ensure `startedAt` parameter is sourced from the active shift's `started_at` instead of the (now removed) `route_runs.started_at`. The function signature stays the same; only the caller's data source changes.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: US1 + US3 — Core Shift Lifecycle (Priority: P1) MVP

**Goal**: Drivers can start and end shifts on a route. Ending a shift does NOT mark the route as completed for the day. A second driver can start a new shift after the first ends.

**Independent Test**: Log in as Driver A → tap "Start Shift" → verify route is `in_progress`. Tap "End Shift" → verify route is NOT "completed for today." Log in as Driver B → tap "Start Shift" → verify new shift starts successfully and live tracking resumes.

### Implementation for US1 + US3

- [x] T005 [US1] Rewrite POST handler in `src/app/api/routes/[routeId]/start/route.ts` — check authorization via `van_drivers` (not `vans.driver_id`), check no active shift exists (`route_shifts WHERE run_id = :runId AND ended_at IS NULL`), upsert `route_runs` if none for today (FR-016), insert `route_shifts` row with `started_at = now()`, return `{ shift, run }` per api-contracts.md. Error: 409 if active shift exists, 403 if driver not in `van_drivers`.
- [x] T006 [P] [US3] Rewrite POST handler in `src/app/api/routes/[routeId]/end/route.ts` — find active shift where `driver_id = auth.user.id AND ended_at IS NULL`, set `ended_at = now()`, return `{ shift, run }` per api-contracts.md. Error: 403 if active shift belongs to different driver, 404 if no active shift. Do NOT update `route_runs` (no more `ended_at` on runs).
- [x] T007 [US1] Update GET handler in `src/app/api/driver/routes/route.ts` — replace `vans.driver_id = :userId` query with `van_drivers` join, include `runStatus` (BFF-derived from shifts + schedule window), `activeShift` (any driver's open shift), `todayShifts` (all shifts today ordered by `started_at` ASC with driver email), simplify `run` object (no timestamps), per api-contracts.md
- [x] T008 [US1] Update `src/components/driver/route-card.tsx` — rename button labels from "Iniciar Rota"/"Encerrar Rota" to "Iniciar Turno"/"Encerrar Turno", use `activeShift` and `todayShifts` from API response to determine button state: show "Iniciar Turno" when no active shift (regardless of prior shifts), show "Encerrar Turno" only if current user owns active shift, show "Turno em andamento" with driver email if another driver's shift is active. Update confirmation dialog text (FR-017: clarify "encerrando seu turno" not "encerrando a rota do dia").

**Checkpoint**: Core shift lifecycle works — Driver A can end shift, Driver B can start new shift. Route is never prematurely completed.

---

## Phase 4: US2 — Admin Multi-Driver Assignment (Priority: P1)

**Goal**: Administrators can assign multiple drivers to a van in a single edit session. No daily driver swapping required.

**Independent Test**: As admin, edit a van → assign two drivers → save. Verify both appear on the van. Log in as each driver → verify both see the van's route.

### Implementation for US2

- [x] T009 [P] [US2] Update PUT handler in `src/app/api/admin/vans/[vanId]/route.ts` — replace `driverId` (single string) with `driverIds` (string array) in Zod schema, validate each ID is an active driver via Supabase Auth admin API, implement full-replace semantics on `van_drivers` table (delete existing rows for van, insert new set), return van with `driverIds` array per api-contracts.md
- [x] T010 [P] [US2] Update GET handler in `src/app/api/admin/vans/route.ts` — join `van_drivers` to build `driverIds` array per van, return `driverIds` instead of single `driverId` per api-contracts.md
- [x] T011 [US2] Update `src/components/admin/van-form.tsx` — replace single driver `Select` dropdown with multi-driver selection UI (checkboxes or multi-select), fetch active drivers list, send `driverIds` array on form submit, display assigned drivers as tags/chips

**Checkpoint**: Admin can manage multi-driver assignments. Combined with Phase 3, the full driver assignment → shift lifecycle works end-to-end.

---

## Phase 5: US4 — Public Portal Between Shifts (Priority: P2)

**Goal**: Passengers see a neutral schedule-only view between shifts, not a misleading "route ended for today" message. The "ended" message only appears after the schedule window fully passes.

**Independent Test**: End a shift as Driver A without Driver B starting. View public route page → should show schedule only (no live tracking, no "ended" banner). Wait for schedule window to pass → should show "ended for today."

### Implementation for US4

- [x] T012 [P] [US4] Update GET handler in `src/app/api/routes/[routeId]/route.ts` — query `route_shifts` for today's run, call updated `deriveRunStatus(shifts, isPastScheduleWindow)`, set `progress` to `null` when status is `idle` (between shifts), use `shiftStartedAt` (from active shift) instead of `startedAt` in progress block, per api-contracts.md
- [x] T013 [P] [US4] Update GET handler in `src/app/api/routes/route.ts` — same shift-based derivation as T012, per api-contracts.md (each route in list uses same `progress` shape with `shiftStartedAt` and null-when-idle)
- [x] T014 [US4] Update `src/components/public/hero-card.tsx` — handle `progress: null` (idle/between-shifts) as schedule-only view without "Rota encerrada por hoje" banner, show schedule timeline only
- [x] T015 [P] [US4] Update `src/components/public/route-status-badge.tsx` — handle `idle` status or null progress gracefully (no badge or neutral badge instead of "ended" badge)

**Checkpoint**: Public portal correctly shows schedule-only between shifts and "ended" only after schedule window passes.

---

## Phase 6: US5 — Driver Shift History (Priority: P3)

**Goal**: Drivers see a summary of all today's shifts on the route page, including shifts by other assigned drivers.

**Independent Test**: Complete two shifts with different drivers. Log in as either driver → verify both shifts appear with start/end times and driver identifiers.

### Implementation for US5

- [x] T016 [US5] Add shift history section to `src/components/driver/route-card.tsx` — render `todayShifts` array (already returned from T007) as a list showing each shift's driver email, start time, end time (or "active" indicator), ordered chronologically. Highlight the current user's shifts.

**Checkpoint**: Drivers have full situational awareness of today's shift activity.

---

## Phase 7: US6 — GPS Fallback Verification (Priority: P3)

**Goal**: Verify the existing GPS ping ingestion and time-aware fallback continue working correctly without an active shift.

**Independent Test**: Send GPS pings for a route with no active shift. Verify pings are recorded and time-aware fallback identifies the next upcoming stop.

### Implementation for US6

- [x] T017 [US6] Verify GPS fallback and stop progress preservation — review `src/app/api/routes/[routeId]/route.ts` (updated in T012) to confirm: (1) when no active shift exists and no shifts have been created (status = `waiting`), the existing time-aware schedule fallback in ETA computation still works; (2) `route_run_stops` are NOT reset when a new shift starts (FR-009 — stop progress accumulates across shifts). No code change expected — this is a verification task.

**Checkpoint**: GPS fallback works identically to pre-feature behavior.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and end-to-end validation

- [x] T018 Run quality gates: `eslint`, `tsc --noEmit`, `next build`, `vitest` (if test suites exist for affected code) — fix any type errors, lint violations, build failures, or test regressions introduced by the changes
- [x] T019 Run quickstart.md validation (manual — requires running infra) — follow all steps in `specs/024-multi-driver-shifts/quickstart.md` to verify the complete workflow end-to-end (migration, driver assignment, shift lifecycle, public portal, shift history)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist) — BLOCKS all user stories
- **US1+US3 (Phase 3)**: Depends on Phase 2 — core shift lifecycle
- **US2 (Phase 4)**: Depends on Phase 2 — can run in PARALLEL with Phase 3
- **US4 (Phase 5)**: Depends on Phase 2 — can run in PARALLEL with Phases 3 and 4
- **US5 (Phase 6)**: Depends on Phase 3 (needs `todayShifts` from driver API)
- **US6 (Phase 7)**: Depends on Phase 5 (needs updated public route API)
- **Polish (Phase 8)**: Depends on all previous phases

### User Story Dependencies

- **US1+US3 (P1)**: After Foundational → independent of US2, US4
- **US2 (P1)**: After Foundational → independent of US1+US3, US4
- **US4 (P2)**: After Foundational → independent of US1+US3, US2
- **US5 (P3)**: After US1+US3 (needs `todayShifts` data from driver API). T016 modifies `route-card.tsx` after T008 — same file, must be sequential.
- **US6 (P3)**: After US4 (needs updated public route API to verify fallback)

### Within Each User Story

- API endpoints before UI components (data must flow before rendering)
- Start endpoint before end endpoint (logical dependency)
- Core functionality before enhancement (history, fallback)

### Parallel Opportunities

- T003 and T004 can run in parallel (different files in Phase 2)
- T005 and T006 can run in parallel (different API files — start vs end)
- T009 and T010 can run in parallel (different admin API files)
- T012 and T013 can run in parallel (different public API files)
- T014 and T015 can run in parallel (different UI component files)
- **Phases 3, 4, and 5 can run in parallel** after Phase 2 completes (different file sets)

---

## Parallel Example: US1+US3 (Phase 3)

```bash
# After Phase 2 completes, launch start and end API rewrites in parallel:
Task: T005 "Rewrite start shift API in src/app/api/routes/[routeId]/start/route.ts"
Task: T006 "Rewrite end shift API in src/app/api/routes/[routeId]/end/route.ts"

# Then sequentially:
Task: T007 "Update driver routes API in src/app/api/driver/routes/route.ts"
Task: T008 "Update route-card.tsx with shift-aware UI"
```

## Parallel Example: Cross-Story Parallelism

```bash
# After Phase 2 completes, three stories can start simultaneously:
# Developer A: Phase 3 (US1+US3) — shift lifecycle
# Developer B: Phase 4 (US2) — admin multi-driver
# Developer C: Phase 5 (US4) — public portal
```

---

## Implementation Strategy

### MVP First (US1 + US3 Only)

1. Complete Phase 1: Setup (migration + types)
2. Complete Phase 2: Foundational (run-status + eta)
3. Complete Phase 3: US1+US3 (start/end shift APIs + driver UI)
4. **STOP and VALIDATE**: Test shift lifecycle with migration-seeded `van_drivers` data
5. Deploy/demo if ready — core problem (second driver blocked) is solved

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1+US3 → Test shift lifecycle → Deploy (MVP — core problem solved!)
3. US2 → Test admin multi-driver → Deploy (admin no longer swaps drivers daily)
4. US4 → Test public portal → Deploy (passengers see neutral view between shifts)
5. US5 → Test shift history → Deploy (driver situational awareness)
6. US6 → Verify GPS fallback → Deploy (safety net confirmed)

### Single Developer Strategy

Phases 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 sequentially (priority order).

### Parallel Team Strategy

1. All developers complete Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1+US3 (Phase 3)
   - Developer B: US2 (Phase 4)
   - Developer C: US4 (Phase 5)
3. After Phase 3 completes: US5 (Phase 6), US6 (Phase 7)
4. Final: Polish (Phase 8)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US3 are combined because starting and ending shifts form one indivisible lifecycle
- Each user story phase has an independent test criterion
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
