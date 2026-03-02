# Tasks: Start Route

**Input**: Design documents from `/specs/022-start-route/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US4)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and shared TypeScript types for all downstream work

- [x] T001 Create migration `supabase/migrations/00003_start_route.sql` — add `driver_id uuid` (nullable) to `vans` table, add `started_at timestamptz` and `ended_at timestamptz` (both nullable) to `route_runs` table
- [x] T002 Update TypeScript types in `src/types/index.ts` — extend `AdminUser.role` to `"admin" | "superuser" | "driver"`, add `driver_id: string | null` to `Van`, add `started_at: string | null` and `ended_at: string | null` to `RouteRun`, add new `RunStatus` type (`"waiting" | "in_progress" | "completed"`), add new `DriverRoute` type, add `runStatus: RunStatus` and `startedAt: string | null` to `RouteProgress`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Auth and routing changes that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Update Zod user validators in `src/lib/validators/user.ts` — add `"driver"` to the `role` enum in both `createUserSchema` and `updateUserSchema`
- [x] T004 [P] Update auth helper in `src/lib/api/auth.ts` — extend `AuthResult.role` type to `"admin" | "superuser" | "driver"`, update `requireRole` to accept `"driver"` as a valid required role
- [x] T005 [P] Update middleware in `src/middleware.ts` — add `/driver/:path*` to matcher, check role from session: if driver role hits `/admin/*` (except `/admin/login`), redirect to `/driver`; if non-driver hits `/driver/*`, redirect to `/admin`
- [x] T006 Update login page in `src/app/admin/login/page.tsx` — after successful login, read role from response and redirect to `/driver` if role is `"driver"`, otherwise keep existing redirect to `/admin`

**Checkpoint**: Auth system recognizes "driver" role, middleware protects /driver/*, login redirects by role

---

## Phase 3: User Story 4 — Driver Role and Authentication (Priority: P1) MVP

**Goal**: Superusers can create driver accounts, assign drivers to vans, and drivers can log in to see their assigned routes

**Independent Test**: Create a driver user via admin UI, assign to a van, log in as driver — should see assigned route(s) on the driver page

### Implementation for User Story 4

- [x] T007 [P] [US4] Update user form in `src/components/admin/user-form.tsx` — add `"driver"` option (label: "Motorista") to the role `Select` component, in both create and edit modes
- [x] T008 [P] [US4] Update admin van API in `src/app/api/admin/vans/[vanId]/route.ts` — accept optional `driverId` (uuid or null) in PUT request body, validate with Zod, update `driver_id` column on `vans` table
- [x] T009 [US4] Update van form in `src/components/admin/van-form.tsx` — add a `Select` for driver assignment that fetches users with `role === "driver"` from `GET /api/admin/users`, shows driver email, allows clearing (null = unassigned). Pass `driverId` in form submission
- [x] T010 [P] [US4] Create `GET /api/driver/routes` endpoint in `src/app/api/driver/routes/route.ts` — authenticate with `requireAuth()`, verify role is `"driver"`, query vans where `driver_id = user.id`, join routes + schedule_entries + today's route_run, return `DriverRoute[]` with run status derived from `started_at`/`ended_at`
- [x] T011 [P] [US4] Create driver layout in `src/app/driver/layout.tsx` — minimal mobile-first layout: top header bar with app name ("CAAB Vans") and a logout button. Auth check via `createSessionClient()` — if no user, redirect to `/admin/login`. Use same `bg-zinc-50` background as admin
- [x] T012 [US4] Create driver route card component in `src/components/driver/route-card.tsx` — display route name, van name, schedule window (first–last stop time), total stops, and current run status badge. Accept `DriverRoute` as prop. Render "Start Route" button when status allows (implementation in US1)
- [x] T013 [US4] Create driver dashboard page in `src/app/driver/page.tsx` — fetch routes via `GET /api/driver/routes` using `fetchWithAuth`, render route cards for each route. Show empty state if no routes assigned ("Nenhuma rota atribuída"). Show loading state while fetching

**Checkpoint**: Full driver auth flow works — create driver, assign to van, login redirects to /driver, driver sees assigned route(s). Admin pages inaccessible to drivers.

---

## Phase 4: User Story 1 — Driver Starts Their Route (Priority: P1)

**Goal**: Drivers can tap "Start Route" and the system records the start time, filtering stops from that point forward for progress tracking

**Independent Test**: Log in as driver, tap "Start Route," verify the route_run has `started_at` set and the progress tracking API only considers stops >= started_at

### Implementation for User Story 1

- [x] T014 [US1] Create `POST /api/routes/[routeId]/start` endpoint in `src/app/api/routes/[routeId]/start/route.ts` — authenticate with `requireAuth()`, verify driver role, look up route → van → verify `van.driver_id === user.id`, check route has schedule entries (422 if not), upsert `route_runs` for `(route_id, today)` with `started_at = now()` (409 if already started), return run with derived status
- [x] T015 [US1] Wire start button in `src/components/driver/route-card.tsx` — when run is null or status is `"waiting"`, show "Iniciar Rota" button. On tap, call `POST /api/routes/{routeId}/start`, update local state to reflect `in_progress`. Disable button while loading. Show error inline on failure
- [x] T016 [P] [US1] Update `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` — after upserting route_run, read `started_at` from the run. When building nextStopId: if `started_at` is set, use `formatTime(DateTime.fromISO(started_at))` as the time floor instead of `nowHHmm`. If `started_at` is null, keep existing `nowHHmm` fallback
- [x] T017 [P] [US1] Update `computeEta` in `src/lib/tracking/eta.ts` — add optional `startedAt?: string | null` parameter. When filtering `futurePending` stops: if `startedAt` is set, use it as the time floor (`stop.time >= startedAtHHmm`); if null, keep existing `nowHHmm` filter. Do NOT update call sites here — T021/T022 will pass `startedAt` when they add `runStatus` to the same API files

**Checkpoint**: Starting a route records `started_at`, progress tracking and ETA computation respect the start time, morning stops are filtered out

---

## Phase 5: User Story 2 — Driver Ends Their Route (Priority: P2)

**Goal**: Drivers can tap "End Route" (with confirmation) and the system records the end time, marking the route as completed

**Independent Test**: Start a route, then tap "End Route," confirm — verify `ended_at` is set and the route cannot be ended again

### Implementation for User Story 2

- [x] T018 [US2] Create `POST /api/routes/[routeId]/end` endpoint in `src/app/api/routes/[routeId]/end/route.ts` — authenticate driver, verify ownership (same pattern as start), find today's run where `started_at IS NOT NULL AND ended_at IS NULL` (404 if no active run, 409 if already ended), set `ended_at = now()`, return run with derived status `"completed"`
- [x] T019 [US2] Add end route flow in `src/components/driver/route-card.tsx` — when status is `"in_progress"`, show "Encerrar Rota" button (destructive variant). On tap, open a shadcn `Dialog` confirmation ("Tem certeza que deseja encerrar a rota? Esta ação não pode ser desfeita."). On confirm, call `POST /api/routes/{routeId}/end`, update state to `"completed"`. Disable controls while loading
- [x] T020 [US2] Update driver page completed state in `src/app/driver/page.tsx` and `src/components/driver/route-card.tsx` — when run status is `"completed"`, show a summary: route name, started at time, ended at time, badge "Encerrada". No start/end buttons visible. Use muted styling (zinc palette)

**Checkpoint**: End route flow works with confirmation dialog, route shows as completed, controls are disabled after ending

---

## Phase 6: User Story 3 — Public Page Shows "Waiting to Start" (Priority: P2)

**Goal**: Passengers see clear lifecycle states on the public route page: "waiting to start" when a run exists but hasn't started, "completed" when the route has ended

**Independent Test**: View the public route page for a route with a run but no `started_at` — should show "waiting to start." Start the route — page updates to live tracking. End the route — page shows "completed"

### Implementation for User Story 3

- [x] T021 [US3] Update `GET /api/routes/[routeId]` in `src/app/api/routes/[routeId]/route.ts` — when fetching route_run, also select `started_at` and `ended_at`. Add `runStatus` (derived from timestamps) and `startedAt` to the `progress` object. Pass `started_at` to `computeEta` call (using the new `startedAt` param added by T017)
- [x] T022 [P] [US3] Update `GET /api/routes` list endpoint in `src/app/api/routes/route.ts` — same changes as T021: read `started_at`/`ended_at` from route_run, add `runStatus` and `startedAt` to each route's progress
- [x] T023 [US3] Update public route page in `src/app/(public)/routes/[routeId]/page.tsx` — check `progress.runStatus`: if `"waiting"`, show a "waiting to start" state (suppress misleading ETA/next-stop data); if `"completed"`, show completed state. When `runStatus` is `"in_progress"` or null (no run), keep existing behavior
- [x] T024 [P] [US3] Update hero card in `src/components/public/hero-card.tsx` — add a `"waiting"` state: show an amber/yellow card with "Aguardando início da rota" message and a clock icon. Add `"completed"` state variant if `runStatus === "completed"`: show a green card with "Rota encerrada por hoje"
- [x] T025 [P] [US3] Update schedule timeline in `src/components/public/schedule-timeline.tsx` — when `runStatus === "waiting"`, render all stops as `"neutral"` (no past/current/future classification). When `runStatus === "completed"`, render all stops as `"past"` (grey)

**Checkpoint**: Public page shows clear lifecycle states matching the driver's actions. Polling updates status automatically

---

## Phase 7: User Story 5 — Fallback When Driver Forgets to Start (Priority: P3)

**Goal**: The system continues to work correctly when no explicit start is provided, using time-aware filtering as a permanent fallback

**Independent Test**: Send GPS pings for a route without pressing "Start Route" — verify ETA/next-stop are computed correctly using `time >= now` fallback

### Implementation for User Story 5

- [x] T026 [US5] Verify and document fallback priority chain in `src/lib/tracking/eta.ts` and `src/lib/tracking/infer-stop-progress.ts` — confirm that when `started_at` is null, the existing `nowHHmm` filter is used (no regression from T016/T017 changes). Add inline comments documenting the priority: `started_at` (explicit) > `now` (fallback). Ensure GPS pings continue to create route_runs implicitly without `started_at` (FR-013)

**Checkpoint**: System degrades gracefully — works with or without explicit start, no regression in existing behavior

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T027 Run quality gates: `eslint` (zero errors), `tsc --noEmit` (zero errors), `next build` (success), `vitest` (all pass)
- [x] T028 Validate quickstart.md scenarios end-to-end: create driver user, assign to van, login as driver, start route, verify public page shows correct state, end route, verify completed state

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US4 (Phase 3)**: Depends on Phase 2 — auth/middleware must be ready
- **US1 (Phase 4)**: Depends on US4 — driver page must exist to wire start button
- **US2 (Phase 5)**: Depends on US1 — route must be startable before it can be ended
- **US3 (Phase 6)**: Depends on US1 (T016/T017 must be complete — US3 call sites pass `startedAt` to the updated `computeEta`)
- **US5 (Phase 7)**: Depends on US1 (T016/T017) — verifies fallback behavior in those changes
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ─── BLOCKS ALL
    │
    ▼
Phase 3 (US4: Auth)
    │
    ▼
Phase 4 (US1: Start Route)
    │
    ├──▶ Phase 5 (US2: End Route)
    │
    ├──▶ Phase 6 (US3: Public Page)
    │         [needs T016/T017 from US1]
    │
    └──▶ Phase 7 (US5: Fallback Verify)
              │
              ▼
         Phase 8 (Polish)
```

### Within Each User Story

- Backend API endpoints before frontend UI wiring
- Core logic changes (tracking) can parallel with API endpoints
- UI components before page integration

### Parallel Opportunities

**Phase 2**: T003, T004, T005 are all different files — run in parallel
**Phase 3**: T007, T008, T010, T011 are all different files — run in parallel. T009 depends on T008. T012 depends on T011. T013 depends on T012
**Phase 4**: T016, T017 are different files — run in parallel. T014 is independent. T015 depends on T014
**Phase 5**: T018 → T019 → T020 (sequential within story)
**Phase 6**: T022, T024, T025 can run in parallel (different files). T021 before T023 (API before page)

---

## Parallel Example: Phase 3 (US4)

```
# Parallel batch 1 — different files, no dependencies:
T007: Update user-form.tsx (admin/user-form.tsx)
T008: Update admin van API (api/admin/vans/[vanId]/route.ts)
T010: Create driver routes API (api/driver/routes/route.ts)
T011: Create driver layout (app/driver/layout.tsx)

# Sequential after batch 1:
T009: Update van form (depends on T008 — needs API ready)
T012: Create route card component (depends on T011 — needs layout)
T013: Create driver page (depends on T010, T012 — needs API + component)
```

---

## Implementation Strategy

### MVP First (US4 + US1)

1. Complete Phase 1: Setup (migration + types)
2. Complete Phase 2: Foundational (auth + middleware)
3. Complete Phase 3: US4 (driver auth + page)
4. Complete Phase 4: US1 (start route)
5. **STOP and VALIDATE**: Driver can log in, see routes, start a route, progress tracking uses started_at
6. Deploy to DEV for testing

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US4 + US1 → Driver can start routes → **MVP Deploy**
3. US2 → Driver can end routes → Deploy
4. US3 → Public page lifecycle states → Deploy
5. US5 → Fallback verification → Deploy
6. Polish → Quality gates + validation → PR ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All API endpoints follow existing pattern: Zod validation → auth check → service client → DB → JSON response
- All UI follows existing admin pattern: fetchWithAuth, useState, inline error text
- Driver UI uses shadcn/ui components already available: Button, Card, Dialog, Badge, Select
- Portuguese labels: "Iniciar Rota" (Start Route), "Encerrar Rota" (End Route), "Motorista" (Driver), "Aguardando início" (Waiting to start)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
