# Tasks: Route-Based Driver Assignment

**Input**: Design documents from `/specs/067-route-driver-assignment/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Migration + Shared Types)

**Purpose**: Create the `route_drivers` table, backfill data from `van_drivers`, and add shared types/validators that all subsequent phases depend on. This phase also delivers **User Story 4** (automatic migration of existing assignments).

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 [US4] Create migration `supabase/migrations/00018_route_drivers.sql` — create `route_drivers` table (PK `route_id, driver_id`, FK to `routes(id) ON DELETE CASCADE`, index on `driver_id`, RLS enabled) and backfill from `van_drivers JOIN routes ON routes.van_id = van_drivers.van_id` per data-model.md
- [x] T002 [P] Add `RouteDriver` type to `src/types/index.ts` — `{ route_id: string; driver_id: string; created_at: string }`
- [x] T003 [P] Add optional `driverIds` field to `createRouteSchema` and `updateRouteSchema` in `src/lib/validators/route.ts` — `driverIds: z.array(z.string().uuid()).optional()`

**Checkpoint**: Migration can be applied. `route_drivers` table exists with backfilled data. Types and validators ready for API changes.

---

## Phase 2: User Story 5 — Admin fetches a dedicated driver list (Priority: P2)

**Goal**: Provide a lightweight driver options endpoint accessible to admins and superusers, returning only active drivers with id and email.

**Independent Test**: Call `GET /api/admin/drivers` as admin → 200 with active drivers. Call as driver → 403.

**Why before US1**: The route form UI (US1) fetches its driver checkbox list from this endpoint.

### Implementation for User Story 5

- [x] T004 [US5] Create `src/app/api/admin/drivers/route.ts` — GET endpoint using `requireRole("admin")`, calling `supabase.auth.admin.listUsers()`, filtering to `role === "driver"` and `is_active !== false`, returning `{ drivers: [{ id, email }] }` sorted by email per contracts/api-contracts.md

**Checkpoint**: Admin and superuser can fetch driver options. Drivers get 403.

---

## Phase 3: User Story 1 — Admin assigns drivers to a route (Priority: P1) MVP

**Goal**: Admins can assign zero or more drivers to a route during creation or editing. The route list API returns `driverIds` per route.

**Independent Test**: Create/edit a route with driver selections via admin UI, verify assignment persists and appears on next load.

### Implementation for User Story 1

- [x] T005 [US1] Modify GET handler in `src/app/api/admin/routes/route.ts` — after fetching routes, query `route_drivers` for all route IDs, group by `route_id`, and add `driverIds: string[]` to each route in the response (empty array if none)
- [x] T006 [US1] Modify POST handler in `src/app/api/admin/routes/route.ts` — parse `driverIds` from body using updated schema, normalize missing to `[]`, de-duplicate with `[...new Set()]`, validate each ID via `supabase.auth.admin.getUserById()` (must be active driver), insert `route_drivers` rows after route creation, include `driverIds` in response. If driver validation fails after route insert, delete the created route.
- [x] T007 [US1] Modify PUT handler in `src/app/api/admin/routes/[routeId]/route.ts` — parse `driverIds` from body using updated schema, normalize/de-duplicate/validate same as POST, delete all existing `route_drivers` for this route, insert new set (full-replacement semantics), include `driverIds` in response
- [x] T008 [US1] Add driver multi-select to `src/components/admin/route-form.tsx` — add `showDriverSelect` prop (default true), `defaultDriverIds` prop, fetch active drivers from `/api/admin/drivers` on mount, render checkbox list (same pattern as current van-form.tsx driver UI), include `driverIds` in form submission data. Update `RouteFormProps` type and `onSubmit` signature to include `driverIds`.
- [x] T009 [P] [US1] Update `src/app/admin/routes/new/page.tsx` — pass `driverIds` in the `onSubmit` handler when calling `POST /api/admin/routes`
- [x] T010 [P] [US1] Update `src/app/admin/routes/[routeId]/page.tsx` — extract `driverIds` from the fetched route data (GET response now includes it), pass as `defaultDriverIds` to `RouteForm`, include `driverIds` in the PUT request body

**Checkpoint**: Admin can create/edit routes with driver assignments. Route list shows driverIds. Full round-trip works via UI.

---

## Phase 4: User Story 2 — Driver discovers and starts assigned routes (Priority: P1)

**Goal**: Drivers see only routes they are assigned to via `route_drivers`. Shift start authorization checks `route_drivers` instead of `van_drivers`.

**Independent Test**: Assign driver to route, login as driver → route appears and shift starts. Unassigned driver → route absent and start returns 403.

### Implementation for User Story 2

- [x] T011 [US2] Modify `src/app/api/driver/routes/route.ts` — replace `van_drivers` query (lines 24-27) with `route_drivers` query: `supabase.from("route_drivers").select("route_id").eq("driver_id", auth.user.id)`. Then fetch routes by `id IN routeIds` instead of `van_id IN vanIds`. Adjust downstream logic: van names come from route's `van_id` join. Remove the intermediate `vanIds` step entirely.
- [x] T012 [US2] Modify `src/app/api/routes/[routeId]/start/route.ts` — replace `van_drivers` authorization check (lines 57-66) with `route_drivers` check: `supabase.from("route_drivers").select("route_id").eq("route_id", routeId).eq("driver_id", auth.user.id).single()`. Update error message from "You are not assigned to this route's van" to "You are not assigned to this route". The van lookup for cold-start detection remains unchanged (still needs `van.id`).

**Checkpoint**: Driver dashboard shows only route-assigned routes. Shift start checks `route_drivers`. End-shift still works (unchanged — uses `route_shifts.driver_id`).

---

## Phase 5: User Story 3 — Admin no longer assigns drivers via van management (Priority: P2)

**Goal**: Remove all driver assignment UI and data from van management. Van edit form shows only van-specific settings.

**Independent Test**: Open van edit page → no driver checkboxes. Call `GET /api/admin/vans` → no `driverIds` in response.

### Implementation for User Story 3

- [x] T013 [P] [US3] Modify `src/app/api/admin/vans/route.ts` — remove the `van_drivers` query (lines 30-32), the `driversByVan` grouping logic (lines 38-43), and the `driverIds` field from the response mapping. Keep all other van fields (name, token, health, etc.) unchanged.
- [x] T014 [P] [US3] Modify `src/app/api/admin/vans/[vanId]/route.ts` — remove `driverIds` from the update schema, remove driver validation logic (getUserById loop), remove `van_drivers` delete/insert operations, remove `driverIds` from the response. Keep `name` and `regenerateToken` handling unchanged.
- [x] T015 [P] [US3] Simplify `src/components/admin/van-form.tsx` — remove `showDriverSelect` prop, `defaultValues.driverIds`, driver fetch from `/api/admin/users`, `toggleDriver` function, and the entire driver checkbox section. Keep name input and form submission. Update `VanFormProps` type.
- [x] T016 [US3] Update `src/app/admin/vans/[vanId]/page.tsx` — remove `showDriverSelect={true}` prop, remove `driverIds` from `defaultValues`, remove `driverIds` from the PUT request body. Pass only `name` (and `regenerateToken` if applicable) to `VanForm`.

**Checkpoint**: Van management is driver-free. No `van_drivers` reads or writes anywhere in application code.

---

## Phase 6: Polish & Quality Gates

**Purpose**: Verify all quality gates pass and the full feature works end-to-end.

- [x] T017 Run lint (`npx eslint .`) and fix any errors introduced by changes
- [x] T018 Run typecheck (`npx tsc --noEmit`) and fix any type errors
- [x] T019 Run build (`npm run build`) and verify it completes successfully
- [x] T020 Run existing test suite (`npx vitest run`) and fix any regressions
- [x] T021 Execute quickstart.md smoke test checklist (10 items) to validate full feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US5)**: Depends on Phase 1 (needs types)
- **Phase 3 (US1)**: Depends on Phase 2 (route form fetches from `/api/admin/drivers`)
- **Phase 4 (US2)**: Depends on Phase 1 only (just needs `route_drivers` table). Can run in parallel with Phase 3.
- **Phase 5 (US3)**: No dependencies on other user stories. Can run in parallel with Phases 3-4.
- **Phase 6 (Polish)**: Depends on all phases complete

### User Story Dependencies

```text
Phase 1 (Foundational + US4)
    │
    ├── Phase 2 (US5: drivers endpoint)
    │       │
    │       └── Phase 3 (US1: admin route assignment) ─── MVP
    │
    ├── Phase 4 (US2: driver discovery + shift auth) ─── parallel with Phase 3
    │
    └── Phase 5 (US3: remove from van mgmt) ─── parallel with Phases 3-4
              │
              └── Phase 6 (Polish)
```

### Within Each User Story

- Validators/types before API routes
- API routes before UI components
- Backend before frontend
- Core implementation before edge-case handling

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different files)
- **Phase 3**: T009 and T010 can run in parallel (different page files)
- **Phase 4**: T011 and T012 can run in parallel (different API route files)
- **Phase 5**: T013, T014, and T015 can all run in parallel (different files)
- **Cross-phase**: Phase 4 (US2) and Phase 5 (US3) can run in parallel with Phase 3 (US1) after Phase 1

---

## Parallel Example: Phase 5 (US3)

```text
# These three tasks touch different files with no dependencies — run together:
Task T013: "Remove driverIds from GET /api/admin/vans response in src/app/api/admin/vans/route.ts"
Task T014: "Remove driverIds handling from PUT /api/admin/vans/[vanId] in src/app/api/admin/vans/[vanId]/route.ts"
Task T015: "Remove driver UI from van-form in src/components/admin/van-form.tsx"
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3)

1. Complete Phase 1: Migration + types + validators
2. Complete Phase 2: Drivers endpoint (US5)
3. Complete Phase 3: Admin route assignment (US1)
4. **STOP and VALIDATE**: Admin can assign drivers to routes and see them persist
5. This is the minimum viable delivery

### Full Delivery (All Phases)

1. Phase 1 → Foundation ready
2. Phase 2 → Drivers endpoint ready
3. Phases 3 + 4 + 5 → All user stories (can overlap if parallelizing)
4. Phase 6 → Quality gates pass, smoke tests green
5. PR to `dev`

### Atomic Cutover Note

All phases MUST be deployed together. The refactor removes `van_drivers` reads/writes (Phase 5) and replaces them with `route_drivers` queries (Phases 3-4). There is no safe partial deploy. Phase 6 validates the complete changeset.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No test tasks generated (not requested in spec)
- `van_drivers` table is kept physically — only application code stops reading/writing it
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
