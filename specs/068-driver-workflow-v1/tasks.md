# Tasks: Driver Workflow V1

**Input**: Design documents from `/specs/068-driver-workflow-v1/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US4 (Deferred Stops, P3) is **out of scope** — see spec clarifications.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US5)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Schema, Types, Validators)

**Purpose**: Database migration, extended TypeScript types, and Zod validation schemas shared across all user stories.

- [X] T001 Create migration `supabase/migrations/00020_stop_exceptions.sql` with all 5 schema changes: extend `route_run_stops.status` CHECK to include `skipped`, add `reason_code`/`note`/`acted_by`/`acted_at` columns to `route_run_stops`, create `route_run_events` table with indexes and RLS, add `is_detour_active`/`detour_reason_code`/`detour_note`/`has_skipped_stops` columns to `route_runs`
- [X] T002 [P] Extend types in `src/types/index.ts`: add `skipped` to `RouteRunStop.status`, add `reason_code`/`note`/`acted_by`/`acted_at` fields to `RouteRunStop`, add `is_detour_active`/`detour_reason_code`/`detour_note`/`has_skipped_stops` to `RouteRun`, add `RouteRunEvent` type, add `SKIP_REASON_CODES`/`DETOUR_REASON_CODES` const arrays and derived union types
- [X] T003 [P] Create `SkipStopBodySchema` and `DetourBodySchema` Zod validation schemas in `src/lib/validators/route-exceptions.ts` per contracts (skip: `stopId` UUID + `reasonCode` + optional `note`; detour: `action` start/end + conditional `reasonCode` + optional `note`)

---

## Phase 2: Foundational (Progression Logic)

**Purpose**: Modify the tracking pipeline so `skipped` stops are treated as "resolved" in the contiguous-prefix model. MUST complete before US2/US3 implementation.

**⚠️ CRITICAL**: No skip-stop or detour work can begin until these changes are in place.

- [X] T004 [P] Modify `enforceCanonicalPrefix()` in `src/lib/tracking/enforce-canonical-prefix.ts` to treat `skipped` as resolved — change the prefix walk condition from `status === "passed"` to `status === "passed" || status === "skipped"`
- [X] T005 [P] Modify `persistCanonicalProgress()` in `src/lib/tracking/persist-canonical-progress.ts` to skip over `skipped` stops when computing `next_stop_id` — the next pending stop after the resolved prefix
- [X] T006 [P] Modify `resolveRouteProgress()` in `src/lib/tracking/resolve-route-progress.ts` to include `skippedStopIds` array, `hasSkippedStops`, `isDetourActive`, `detourReasonCode`, `detourNote` in the `RouteProgress` response
- [X] T007 [P] Verify `inferStopProgress()` in `src/lib/tracking/infer-stop-progress.ts` backfill only targets `pending` stops — confirm the existing `WHERE status = 'pending'` filter naturally excludes skipped stops (add guard comment if already correct)
- [X] T008 [P] Verify `processDeviceGeofenceEvents()` in `src/lib/tracking/process-device-geofence-events.ts` pending list excludes `skipped` stops — confirm the existing pending filter works correctly (add guard comment if already correct)
- [X] T009 [P] Modify `computeEta()` in `src/lib/tracking/eta.ts` to exclude `skipped` stops from delay calculation — ETA targets the first pending stop only
- [X] T010 [P] Modify `deriveRunStatus()` in `src/lib/tracking/run-status.ts` to treat a run where all stops are resolved (passed + skipped, zero pending) as completed
- [X] T011 Write unit tests for modified progression logic in `src/tests/lib/tracking/`: test `enforceCanonicalPrefix` with mixed passed/skipped/pending sequences, test `computeEta` excludes skipped stops, test all-skipped-run completion

**Checkpoint**: Progression pipeline handles `skipped` status correctly. Existing geofence and backfill flows unaffected for `pending`/`passed` stops.

---

## Phase 3: User Story 1 — Active-Route Driver Screen (Priority: P1) 🎯 MVP

**Goal**: Transform the driver area from a shift launcher into a live run console with next-stop hero, ETA, map, scrollable stop list, tracker health, and navigation handoff.

**Independent Test**: Start a shift, tap into the route → verify the active-route screen loads with real-time data (next stop, ETA, map, tracker health, 5s auto-refresh). Tap "Navegar" → device opens navigation app with next stop coordinates.

### Implementation for User Story 1

- [X] T012 [US1] Create `GET /api/driver/routes/[routeId]` endpoint in `src/app/api/driver/routes/[routeId]/route.ts` — require driver role + route assignment via `route_drivers`, wrap `resolveRouteProgress()`, query latest ping for tracker health (lastPingAt, batteryLevel, networkType, bufferSize, failureCount), compute `isStale` (>5min) and `isLowBattery` (<0.20), return full response per contract
- [X] T013 [P] [US1] Create `next-stop-hero.tsx` component in `src/components/driver/active-route/next-stop-hero.tsx` — display stop name, scheduled time, ETA, delay badge (minutes late/early), and "Navegar" button
- [X] T014 [P] [US1] Create `stop-list.tsx` component in `src/components/driver/active-route/stop-list.tsx` — scrollable list with passed (completed check), pending (upcoming), and skipped (Pulada badge) visual states per stop
- [X] T015 [P] [US1] Create `tracker-health.tsx` component in `src/components/driver/active-route/tracker-health.tsx` — display last ping age, battery level, network type with warning states for stale (>5min) and low battery (<20%)
- [X] T016 [US1] Create active-route page in `src/app/driver/routes/[routeId]/page.tsx` — compose next-stop-hero, stop-list, tracker-health components, use TanStack Query with `refetchInterval: 5_000` (same pattern as `src/lib/queries/use-route-detail.ts`), add shift end button with confirmation dialog, redirect to route list if no active shift
- [X] T017 [US1] Implement navigation handoff in `src/components/driver/active-route/next-stop-hero.tsx` — "Navegar" button opens Google Maps URL (`https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving`) with next stop coordinates
- [X] T018 [US1] Modify `route-card.tsx` in `src/components/driver/route-card.tsx` to link to `/driver/routes/[routeId]` when shift is running instead of only showing start/end controls

**Checkpoint**: Driver can open active-route screen, see live progress with 5s auto-refresh, navigate to next stop, view tracker health, and end shift. MVP is deliverable.

---

## Phase 4: User Story 2 — Skip-Stop Exception (Priority: P2)

**Goal**: Allow a driver to skip the current next stop with a required reason code, advance progression, and create an immutable audit event.

**Independent Test**: Start a shift, advance to mid-route, skip the current next stop with a reason. Verify: next-stop hero advances, skipped stop shows "Pulada" badge with reason, `route_run_events` has a `stop_skipped` event, ETA reflects remaining pending stops only.

### Implementation for User Story 2

- [X] T019 [US2] Create `POST /api/routes/[routeId]/skip-stop` endpoint in `src/app/api/routes/[routeId]/skip-stop/route.ts` — validate with `SkipStopBodySchema`, enforce driver role + active shift ownership, verify `stopId` matches current `next_stop_id` (409 if mismatch), update `route_run_stops` (status=skipped, reason_code, note, acted_by, acted_at), insert `route_run_events` (stop_skipped), set `route_runs.has_skipped_stops = true`, call `persistCanonicalProgress()` to advance `next_stop_id`, handle idempotency (200 if already skipped by same actor)
- [X] T020 [US2] Create exception drawer component in `src/components/driver/active-route/exception-drawer.tsx` — "Pular proxima parada" action with reason picker (SKIP_REASON_CODES mapped to Portuguese labels), optional note field (required when reason is "other"), confirmation step before submit
- [X] T021 [US2] Add "Pulada" badge and reason display to skipped stops in `src/components/driver/active-route/stop-list.tsx` — show reason label in Portuguese, note text if present
- [X] T022 [US2] Wire exception drawer into active-route page in `src/app/driver/routes/[routeId]/page.tsx` — add exception menu trigger button, TanStack Query mutation for skip-stop, invalidate route query on success to refresh progress

**Checkpoint**: Skip-stop works end-to-end. Skipped stops don't block progression. Audit trail records all skips.

---

## Phase 5: User Story 3 — Detour Mode (Priority: P2)

**Goal**: Allow a driver to enter/exit informational detour mode with a reason, auto-deactivate on shift end, and create audit events.

**Independent Test**: Start a shift, enter detour mode with a reason → "Em desvio" indicator appears. Exit detour → indicator disappears. End shift while in detour → detour auto-deactivates with `shift_ended` reason. Check `route_run_events` for both `detour_started` and `detour_ended` events.

### Implementation for User Story 3

- [X] T023 [US3] Create `POST /api/routes/[routeId]/detour` endpoint in `src/app/api/routes/[routeId]/detour/route.ts` — validate with `DetourBodySchema`, enforce driver role + active shift ownership, on `start`: require reasonCode (409 if already active), update `route_runs` (is_detour_active=true, detour_reason_code, detour_note), insert `route_run_events` (detour_started); on `end`: verify detour active (409 if not), clear detour fields, insert `route_run_events` (detour_ended)
- [X] T024 [US3] Add detour toggle to exception drawer in `src/components/driver/active-route/exception-drawer.tsx` — "Entrar em desvio" (when not active) with reason picker (DETOUR_REASON_CODES) + optional note, "Sair do desvio" (when active) with simple confirmation
- [X] T025 [US3] Add "Em desvio" indicator banner to active-route page in `src/app/driver/routes/[routeId]/page.tsx` — show when `progress.isDetourActive` is true, display reason label, TanStack Query mutation for detour toggle
- [X] T026 [US3] Modify shift end handler to auto-deactivate detour in `src/app/api/routes/[routeId]/end/route.ts` — when `is_detour_active = true` at shift end, set `is_detour_active = false`, clear reason/note, insert `route_run_events` with `detour_ended` and `reason_code = 'shift_ended'`

**Checkpoint**: Detour mode works end-to-end. Auto-deactivates on shift end. Audit trail records all detour events.

---

## Phase 6: User Story 5 — Public Warning States (Priority: P4)

**Goal**: Surface exception indicators (skipped stops, active detour) on public route pages so passengers know when a route is deviating.

**Independent Test**: Skip a stop or enter detour as a driver, then view the public route page. Verify: warning badge on route list, "Pulada" indicator on skipped stop in timeline, detour banner when active, ETA caveat note, and no indicators when no exceptions exist.

### Implementation for User Story 5

- [X] T027 [P] [US5] Extend `GET /api/routes` response to include `hasSkippedStops` and `isDetourActive` flags from `route_runs` in the route list query
- [X] T028 [P] [US5] Extend `GET /api/routes/[routeId]` response to include per-stop `status` with `skipped` value and `reasonCode`/`note` for skipped stops in the route detail query
- [X] T029 [US5] Add warning badge to public route list for routes with exceptions (hasSkippedStops or isDetourActive) in route list component
- [X] T030 [US5] Add skipped-stop styling ("Pulada — parada pulada pelo motorista") to schedule timeline in `src/components/route/schedule-timeline.tsx`
- [X] T031 [US5] Add detour banner to public route detail in `src/app/(public)/routes/[routeId]/page.tsx` — show when `isDetourActive` is true with reason label
- [X] T032 [US5] Add ETA caveat note ("Tempo estimado pode variar — parada(s) com alteracao") when exceptions exist in public route detail

**Checkpoint**: Public pages show exception indicators. Routes with no exceptions display identically to today.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Extend remaining API responses, validate end-to-end flow, run quality gates.

- [X] T033 [P] Extend `GET /api/driver/routes` response with `hasSkippedStops` and `isDetourActive` exception flags in `src/app/api/driver/routes/route.ts`
- [ ] T034 Run quickstart.md manual validation flow: start shift → view active-route → skip a stop → enter/exit detour → verify public page warnings → end shift
- [X] T035 Run quality gates: `eslint`, `tsc --noEmit`, `next build`, `vitest`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T002 (types) — BLOCKS US2 and US3 skip/detour logic
- **US1 (Phase 3)**: Depends on T002 (types) — can start in parallel with Phase 2
- **US2 (Phase 4)**: Depends on Phase 2 completion (progression logic must handle `skipped`)
- **US3 (Phase 5)**: Depends on T001 (migration) and T002 (types) — can run in parallel with US2
- **US5 (Phase 6)**: Depends on US2 and US3 (exception data must exist to display)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after T002 (types). No dependency on other stories. **MVP deliverable on its own.**
- **US2 (P2)**: Requires Phase 2 (foundational). Independent of US3.
- **US3 (P2)**: Requires T001 (migration) + T002 (types). Independent of US2 — can run in parallel.
- **US5 (P4)**: Requires US2 and US3 to be functional (needs exception data flowing through APIs).

### Within Each User Story

- API endpoints before UI components (data layer first)
- Components before page composition
- Core implementation before integration wiring

### Parallel Opportunities

- T002 + T003 can run in parallel (Setup — different files)
- T004 through T010 can all run in parallel (Foundational — different files)
- T013 + T014 + T015 can run in parallel (US1 components — different files)
- T027 + T028 can run in parallel (US5 API extensions — different endpoints)
- US2 and US3 can run in parallel after Phase 2 completes (independent stories)

---

## Parallel Example: User Story 1

```bash
# Launch all US1 components in parallel (different files, no dependencies):
Task T013: "Create next-stop-hero.tsx in src/components/driver/active-route/"
Task T014: "Create stop-list.tsx in src/components/driver/active-route/"
Task T015: "Create tracker-health.tsx in src/components/driver/active-route/"

# Then compose into page (depends on T012-T015):
Task T016: "Create active-route page in src/app/driver/routes/[routeId]/page.tsx"
```

## Parallel Example: US2 + US3 in parallel

```bash
# After Phase 2 completes, two developers can work independently:
Developer A (US2): T019 → T020 → T021 → T022
Developer B (US3): T023 → T024 → T025 → T026
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T011)
3. Complete Phase 3: US1 (T012–T018)
4. **STOP and VALIDATE**: Active-route screen works with live data, 5s polling, navigation handoff, tracker health
5. Deploy to DEV — drivers get immediate value

### Incremental Delivery

1. Setup + Foundational → Pipeline ready for skipped stops
2. US1 → Active-route screen (MVP!)
3. US2 → Skip-stop exception handling
4. US3 → Detour mode (can overlap with US2)
5. US5 → Public warning states
6. Polish → Quality gates, end-to-end validation

### Suggested PR Sequence

1. **PR 1**: Phase 1 + Phase 2 (migration, types, progression logic + tests)
2. **PR 2**: Phase 3 (US1 — active-route screen, MVP)
3. **PR 3**: Phase 4 + Phase 5 (US2 + US3 — skip-stop + detour, both P2)
4. **PR 4**: Phase 6 + Phase 7 (US5 — public warnings + polish)

---

## Notes

- US4 (Deferred Stops, P3) is **out of scope** for this branch per spec clarification
- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- All new endpoints use `requireAuth()` + driver role + shift ownership checks
- Reason code labels in Portuguese: see quickstart.md § Reason Code Reference
- Commit after each task or logical group using conventional commits
- Stop at any checkpoint to validate the story independently
