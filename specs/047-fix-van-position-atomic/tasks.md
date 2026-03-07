# Tasks: Atomic Van Position Update

**Input**: Design documents from `/specs/047-fix-van-position-atomic/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Not explicitly requested. Existing test updates included where mocks break.

**Organization**: US1 and US2 share the same fix surface (atomic RPC) and are combined into a single phase. US3 (consumer migration) is a separate phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Schema + Types)

**Purpose**: Database migration and TypeScript types that block all subsequent work

**CRITICAL**: No ingest or consumer changes can begin until this phase is complete

- [x] T001 Create migration `supabase/migrations/00009_atomic_van_position.sql` with three operations: (1) `ALTER TABLE vans ADD COLUMN last_gps_fix_at timestamptz`, (2) backfill `last_gps_fix_at` from `MAX(device_ts)` per van in `van_location_pings`, (3) `CREATE OR REPLACE FUNCTION update_van_position(...)` — atomic RPC that updates all position fields with `WHERE id = p_van_id AND (last_gps_fix_at IS NULL OR p_device_ts > last_gps_fix_at)`, sets `location_updated_at = NOW()`, returns `BOOLEAN` via `FOUND`. See `data-model.md` for full parameter list and guard clause.
- [x] T002 Add `last_gps_fix_at: string | null` to the `Van` type in `src/types/index.ts`

**Checkpoint**: Migration applied, types updated. RPC function available via `supabase.rpc("update_van_position", ...)`.

---

## Phase 2: User Stories 1 + 2 — Atomic Ingest with Device Timestamp (Priority: P1)

**Goal**: Replace the read-decide-update pattern in both ingest routes with the atomic RPC. This simultaneously fixes the wrong timestamp (US1) and the race condition (US2).

**Independent Test**: Send a ping via `/api/tracking/{vanId}` and verify `vans.last_gps_fix_at` matches the device timestamp. Send an older ping and verify position is not overwritten.

### Implementation

- [x] T003 [P] [US1] Refactor single-ping ingest in `src/app/api/tracking/[vanId]/route.ts`: (1) Remove the `previousLatest` SELECT query (lines ~90-97). (2) Remove the sequence gap detection block (lines ~136-154) that references `previousLatest` — this is dead code (console.warn only, no business logic; see Finding #4 in doc 0073). (3) After OSRM snapping, replace the direct `supabase.from("vans").update(...)` block (lines ~192-208) with `const { data: updated } = await supabase.rpc("update_van_position", { p_van_id: vanId, p_lat: lat, p_lng: lng, p_accuracy_m: accuracy, p_speed_mps: speed, p_heading_deg: heading, p_snapped_lat: snappedLat, p_snapped_lng: snappedLng, p_device_ts: deviceTs })`. (4) Replace `isNewest` check (lines ~159-161) with the RPC's boolean return: only call `inferStopProgress` when `updated === true`. (5) Keep the ping upsert into `van_location_pings` unchanged. (6) Keep OSRM trajectory query and snapping logic unchanged.
- [x] T004 [P] [US2] Refactor batch-ping ingest in `src/app/api/tracking-batch/[vanId]/route.ts`: (1) Remove the `previousLatest` SELECT query (lines ~71-77). (2) Remove the sequence gap detection block (lines ~144-163) that references `previousLatest` — dead code (console.warn only; see Finding #4 in doc 0073). (3) Keep the loop that upserts pings and tracks `newestUpserted`. (4) After the loop and OSRM snapping, replace the direct `supabase.from("vans").update(...)` block (lines ~201-213) with a single `supabase.rpc("update_van_position", {...})` call using `newestUpserted`'s coordinates and `deviceTs`. (5) Replace `isNewest` check (lines ~167-170) with the RPC's boolean return for gating `inferStopProgress`. (6) Keep ping upserts and OSRM trajectory logic unchanged.

**Checkpoint**: Both ingest endpoints use atomic RPC. Position never regresses. `last_gps_fix_at` stores device timestamp. `location_updated_at` continues to be set (by the RPC) for audit.

---

## Phase 3: User Story 3 — Consumer Freshness Migration (Priority: P2)

**Goal**: All freshness consumers read `last_gps_fix_at` instead of `location_updated_at` for GPS age calculations.

**Independent Test**: Ingest a ping with a known device timestamp, then query `GET /api/routes/{routeId}` and verify `van.lastGpsFixAt` matches the device timestamp and freshness/ETA age is computed from it.

### Implementation

- [x] T005 [US3] Rename `locationUpdatedAt` to `lastGpsFixAt` in `VanPosition` interface in `src/lib/tracking/eta.ts` (line ~20). Update the age calculation (lines ~91-95) to use `vanPosition.lastGpsFixAt`. No change to `isLocationFresh()` in `src/lib/time.ts` (it still takes `DateTime`).
- [x] T006 [P] [US3] Update route list API in `src/app/api/routes/route.ts`: (1) Add `last_gps_fix_at` to the `.select()` query (line ~32). (2) Change freshness check (lines ~88-90) to use `van.last_gps_fix_at` instead of `van.location_updated_at`. (3) Change VanPosition construction (lines ~115-120) to pass `lastGpsFixAt: DateTime.fromISO(van.last_gps_fix_at)`. (4) Change API response field (line ~302) from `locationUpdatedAt` to `lastGpsFixAt: van.last_gps_fix_at`.
- [x] T007 [P] [US3] Update route detail API in `src/app/api/routes/[routeId]/route.ts`: Same 4 changes as T006 — add `last_gps_fix_at` to select (line ~37), freshness check (lines ~88-90), VanPosition construction (lines ~123-128), API response field (line ~311).
- [x] T008 [P] [US3] Update tracker health in `src/lib/tracking/tracker-health.ts`: Change `.select()` (line ~23) to query `last_gps_fix_at`. Update staleness calculation (lines ~40-45) to use `van.last_gps_fix_at`. Update response field (line ~58).
- [x] T009 [US3] Update API response types in `src/types/index.ts`: In the route API response type that includes `van` object, rename `locationUpdatedAt` to `lastGpsFixAt`. Keep `location_updated_at` on the `Van` DB type (it still exists in the DB for audit).
- [x] T010 [US3] Update frontend components that consume the renamed field: (1) In `src/app/(public)/routes/[routeId]/page.tsx` (line ~259), change `locationUpdatedAt` prop to `lastGpsFixAt`. (2) In `src/components/public/hero-card.tsx` (lines ~10, 32, 168-176), rename the `locationUpdatedAt` prop to `lastGpsFixAt` and update all references. The display label ("Atualizado:") and formatting logic remain unchanged.
- [x] T011 [US3] Update admin vans API in `src/app/api/admin/vans/route.ts`: Add `last_gps_fix_at` to the `.select()` query (line ~21). In the response mapping (line ~50), add `lastGpsFixAt: v.last_gps_fix_at` alongside existing `locationUpdatedAt: v.location_updated_at` (admin sees both for debugging). Update admin vans page `src/app/admin/vans/page.tsx` type and display if it shows the timestamp.

**Checkpoint**: All consumers use `last_gps_fix_at`. ETA age calculations reflect actual GPS device time.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Fix broken tests and run quality gates

- [x] T012 Update ETA test mocks in `src/__tests__/tracking/eta.test.ts`: Rename all `locationUpdatedAt` properties in `VanPosition` mock objects to `lastGpsFixAt`. Ensure tests pass.
- [x] T013 Update freshness tests in `src/__tests__/time/is-location-fresh.test.ts` if any reference `locationUpdatedAt` (function signature unchanged, but verify test descriptions).
- [x] T014 Run quality gates: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`. Fix any issues.
- [ ] T015 Run quickstart.md validation: Manually test the 3 scenarios from `specs/047-fix-van-position-atomic/quickstart.md` against local dev environment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1+US2)**: Depends on Phase 1 (migration must be applied, types updated)
- **Phase 3 (US3)**: Depends on Phase 1 (types updated). Can run in parallel with Phase 2 since it touches different files.
- **Phase 4 (Polish)**: Depends on Phases 2 and 3 being complete

### User Story Dependencies

- **US1 + US2 (P1)**: Combined — both resolved by the atomic RPC in ingest routes
- **US3 (P2)**: Independent of US1/US2 at code level (different files), but logically depends on `last_gps_fix_at` column existing (Phase 1)

### Within Each Phase

- Phase 2: T003 and T004 can run in parallel (different files)
- Phase 3: T006, T007, T008 can run in parallel (different files). T005 must complete before T006/T007 (they reference `VanPosition`). T009 should complete before T010 (frontend depends on types). T011 is independent.

### Parallel Opportunities

```text
After Phase 1 completes:
  ├── Phase 2: T003 ∥ T004 (parallel — different ingest files)
  └── Phase 3: T005 → (T006 ∥ T007 ∥ T008) → T009 → T010
                        T011 (independent, parallel with any)
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Migration + types
2. Complete Phase 2: Both ingest routes use atomic RPC
3. **STOP and VALIDATE**: Verify position never regresses, `last_gps_fix_at` stores device time
4. This alone fixes the two critical bugs — consumers still work (just read wrong timestamp until Phase 3)

### Full Delivery

1. Phase 1 → Phase 2 + Phase 3 (parallel) → Phase 4
2. Each phase is a logical commit boundary
3. Estimated: 4 commits, single PR targeting `dev`

---

## Notes

- T003 and T004 are the core fix — they replace the vulnerable read-decide-update pattern with a single atomic RPC call
- The `previousLatest` query is removed (not just bypassed) — the RPC's `WHERE` guard makes it unnecessary
- `location_updated_at` is NOT removed or renamed — it continues to serve admin/audit purposes, set by the RPC to `NOW()`
- Sequence gap detection blocks are removed along with `previousLatest` — they were dead code (console.warn only, no business logic; identified as dead code in Finding #4, doc 0073)
- The `isLocationFresh()` function in `src/lib/time.ts` needs no changes — its signature takes `DateTime`, callers just pass the new field
