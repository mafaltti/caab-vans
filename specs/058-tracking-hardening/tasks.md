# Tasks: Tracking System Hardening

**Input**: Design documents from `/specs/058-tracking-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the spec and plan explicitly define test requirements for each phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Schema migration and shared infrastructure that all stories depend on

- [x] T001 Create migration `supabase/migrations/00014_add_snapped_coords_to_van_location_pings.sql` adding `snapped_lat double precision null` and `snapped_lng double precision null` to `van_location_pings`
- [x] T002 [P] Add `matchTrajectory()` function to `src/lib/tracking/osrm.ts` — parse all tracepoints from OSRM /match response, return `Array<{ lat: number; lng: number } | null> | null`

---

## Phase 2: Foundational — Event-Time Inference Signature (Blocking)

**Purpose**: Change `inferStopProgress` to accept object arg with `eventTs`. All user stories depend on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Refactor `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` from positional args to object arg `{ supabase, vanId, rawLat, rawLng, snappedLat, snappedLng, eventTs }` per contract in `contracts/infer-stop-progress.md`
- [x] T004 Update `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` to derive `serviceDate` from `eventTs` calendar date in America/Bahia instead of `todayBahiaDate()`
- [x] T005 Update shift gate in `src/lib/tracking/infer-stop-progress.ts` to find shift active at `eventTs`: `started_at <= eventTs AND (ended_at IS NULL OR ended_at > eventTs)`
- [x] T006 Update time comparisons in `src/lib/tracking/infer-stop-progress.ts` to use `eventTime` derived from `eventTs` for early-arrival window, closest-in-time matching, and schedule-time anchoring
- [x] T007 Update `passed_at` assignment in `src/lib/tracking/infer-stop-progress.ts` to use `eventTs` instead of `new Date().toISOString()`
- [x] T008 Update single-ping route in `src/app/api/tracking/[vanId]/route.ts` to pass `eventTs: deviceTs` and rename lat/lng params to `rawLat`/`rawLng` in the `inferStopProgress` call
- [x] T009 Update single-ping route in `src/app/api/tracking/[vanId]/route.ts` to always run `inferStopProgress` after a successful upsert, even when `update_van_position` returns false
- [x] T010 Update single-ping route in `src/app/api/tracking/[vanId]/route.ts` to write computed `snapped_lat`/`snapped_lng` back to the accepted `van_location_pings` row
- [x] T011 Update existing tests in `src/__tests__/tracking/` that call `inferStopProgress` to use the new object arg signature (including `tracking-dedup.test.ts`)

**Checkpoint**: Foundation ready — `inferStopProgress` accepts event time, callers updated, tests pass with new signature

---

## Phase 3: User Story 1 — Accurate Stop Progress from Buffered GPS Pings (Priority: P1) 🎯 MVP

**Goal**: Batch replay of buffered pings — each accepted ping triggers individual stop inference in chronological order

**Independent Test**: Send a batch where an earlier ping crosses Stop B and a later ping does not. Verify Stop B is marked as passed with the correct device timestamp.

### Tests for User Story 1

- [x] T012 [P] [US1] Create `src/__tests__/tracking/tracking-batch.test.ts` — test: earlier ping crosses stop, later doesn't → progress advances with correct `passed_at`
- [x] T013 [P] [US1] Add test in `src/__tests__/tracking/tracking-batch.test.ts` — test: replay is chronological (pings processed in device_ts order)
- [x] T014 [P] [US1] Add test in `src/__tests__/tracking/tracking-batch.test.ts` — test: inference runs even when `update_van_position` returns false
- [x] T015 [P] [US1] Add test in `src/__tests__/tracking/tracking-batch.test.ts` — test: per-point snapped coords from matchTrajectory are passed into each inference call
- [x] T016 [P] [US1] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: event-time service date derivation works correctly
- [x] T017 [P] [US1] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: shift-active-at-event-time allows replay after shift end
- [x] T018 [P] [US1] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: `passed_at` equals `eventTs`, not server time

### Implementation for User Story 1

- [x] T019 [US1] Update batch route in `src/app/api/tracking-batch/[vanId]/route.ts` — after upsert loop, collect accepted (non-duplicate) pings in chronological order
- [x] T020 [US1] Update batch route in `src/app/api/tracking-batch/[vanId]/route.ts` — call `matchTrajectory()` on accepted trajectory, write `snapped_lat`/`snapped_lng` back to pings
- [x] T021 [US1] Update batch route in `src/app/api/tracking-batch/[vanId]/route.ts` — replay `inferStopProgress()` sequentially for each accepted ping with its own `eventTs`
- [x] T022 [US1] Update batch route in `src/app/api/tracking-batch/[vanId]/route.ts` — call `update_van_position` only once for the newest accepted point, run inference even when RPC returns false
- [x] T023 [US1] Update/remove "does not call inferStopProgress when RPC returns false" test in `src/__tests__/tracking/tracking-dedup.test.ts` (behavior now changes)

**Checkpoint**: Batch replay works — buffered pings advance stop progress correctly with event-time semantics

---

## Phase 4: User Story 2 — Consistent Stop Progress Without Phantom Passed Stops (Priority: P1)

**Goal**: Canonical write enforcement — only contiguous passed prefix persists in storage, non-contiguous rows healed

**Independent Test**: Simulate a low-confidence match at a non-adjacent stop and verify it's not persisted. Verify corrupted non-contiguous rows are healed.

### Tests for User Story 2

- [x] T024 [P] [US2] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: low-confidence late match does not persist non-contiguous `passed` row
- [x] T025 [P] [US2] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: previously corrupted non-contiguous rows are healed back to `pending`
- [x] T026 [P] [US2] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: contiguous legitimate passes all persist correctly

### Implementation for User Story 2

- [x] T027 [US2] Update `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` — after computing newlyPassedIds and backfills, build `candidatePassedSet = existingPassed ∪ newMatches ∪ newBackfills`
- [x] T028 [US2] Update `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` — walk from route start, keep only contiguous passed prefix, write only pending rows entering the prefix
- [x] T029 [US2] Update `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` — revert stored `passed` rows outside prefix to `pending` (clear `passed_at`, `pass_source`, `pass_confidence`)
- [x] T030 [US2] Update `inferStopProgress` in `src/lib/tracking/infer-stop-progress.ts` — persist `last_passed_stop_id` / `next_stop_id` from canonical prefix only
- [x] T031 [US2] Keep read-path masking in `src/lib/tracking/resolve-route-progress.ts` as defense-in-depth (verify existing logic at lines 146-159 still works with canonical writes)

**Checkpoint**: Canonical writes enforce contiguous prefix — no phantom passed stops in storage

---

## Phase 5: User Story 3 — Consistent Position for ETA and Stop Detection (Priority: P2)

**Goal**: Shared effective-position helper used by both ETA and stop passage detection

**Independent Test**: For a van near the active stop, verify ETA and passage use the identical effective position.

### Tests for User Story 3

- [x] T032 [P] [US3] Create `src/__tests__/tracking/effective-position.test.ts` — test: raw preferred when closer to target
- [x] T033 [P] [US3] Add test in `src/__tests__/tracking/effective-position.test.ts` — test: snapped preferred when closer to target
- [x] T034 [P] [US3] Add test in `src/__tests__/tracking/effective-position.test.ts` — test: fallback to raw when snapped is null/undefined
- [x] T035 [P] [US3] Add test in `src/__tests__/tracking/effective-position.test.ts` — test: fallback to raw when snap displacement exceeds threshold
- [x] T036 [P] [US3] Add test in `src/__tests__/tracking/eta.test.ts` — test: ETA and passage use same effective position

### Implementation for User Story 3

- [x] T037 [US3] Create `src/lib/tracking/effective-position.ts` with `chooseEffectivePosition()` per contract in `contracts/effective-position.md`; move `SNAP_DISPLACEMENT_THRESHOLD_M` here
- [x] T038 [US3] Update `src/lib/tracking/infer-stop-progress.ts` — replace inline per-stop raw-vs-snapped logic with `chooseEffectivePosition()` call; re-export threshold if needed for compat
- [x] T039 [US3] Extend `VanPosition` interface in `src/lib/tracking/eta.ts` with `snappedLat: number | null` and `snappedLng: number | null`
- [x] T040 [US3] Update GPS ETA branch in `src/lib/tracking/eta.ts` to use `chooseEffectivePosition()` for distance to active target stop
- [x] T041 [P] [US3] Update `VanPosition` construction in `src/app/api/routes/route.ts` (~line 114) — pass `lat: van.last_lat` (raw) + `snappedLat: van.snapped_lat` instead of preferring snapped
- [x] T042 [P] [US3] Update `VanPosition` construction in `src/app/api/routes/[routeId]/route.ts` (~line 122) — same change as T041

**Checkpoint**: ETA and stop passage use identical effective position — no contradictory results

---

## Phase 6: User Story 4 — Reliable Confidence Scoring (Priority: P2)

**Goal**: Remove evidence cap, align confidence source with match source

**Independent Test**: Verify snapped-triggered match counts only snapped evidence; raw-triggered counts raw evidence; no arbitrary ping cap.

### Tests for User Story 4

- [x] T043 [P] [US4] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: no `.limit(50)` cap (all pings in time window considered)
- [x] T044 [P] [US4] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: snapped-triggered match counts only snapped evidence pings
- [x] T045 [P] [US4] Add test in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: raw-triggered match counts only raw evidence pings

### Implementation for User Story 4

- [x] T046 [US4] Remove `.limit(50)` from evidence query in `src/lib/tracking/infer-stop-progress.ts`
- [x] T047 [US4] Update evidence query in `src/lib/tracking/infer-stop-progress.ts` to also select `snapped_lat`, `snapped_lng` from `van_location_pings`
- [x] T048 [US4] Implement source-aligned evidence counting in `src/lib/tracking/infer-stop-progress.ts` — for snapped-triggered matches, count only pings with stored snapped coords in geofence; for raw-triggered, count using raw coords

**Checkpoint**: Confidence scoring uses full time window with source-aligned evidence

---

## Phase 7: User Story 5 — Orphaned Shift Visibility (Priority: P3)

**Goal**: Surface orphaned shift health on the read path using a shared helper

**Independent Test**: Query a route 90+ min past schedule end with 30+ min since last ping — verify "orphaned" health.

### Tests for User Story 5

- [x] T049 [P] [US5] Add test in `src/__tests__/tracking/resolve-route-progress.test.ts` — test: `runHealth = "orphaned"` when shift meets both orphan criteria
- [x] T050 [P] [US5] Add test in `src/__tests__/tracking/resolve-route-progress.test.ts` — test: `runHealth = "normal"` when shift is within schedule window

### Implementation for User Story 5

- [x] T051 [US5] Create `src/lib/tracking/orphaned-shift-health.ts` with `isOrphanedShift()` and exported constants per contract in `contracts/orphaned-shift-health.md`
- [x] T052 [US5] Add `runHealth?: "normal" | "orphaned"` to `RouteProgress` type in `src/types/index.ts`
- [x] T053 [US5] Update `src/lib/tracking/resolve-route-progress.ts` to compute and set `runHealth` using `isOrphanedShift()` helper
- [x] T054 [US5] Update `scripts/reconcile-orphaned-shifts.ts` to import `isOrphanedShift` and constants from shared helper, removing inline duplicates

**Checkpoint**: Orphaned shifts visible on read path; reconciliation script shares same criteria

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final quality gates

- [x] T055 [P] Update `docs/OPERATIONS.md` — document `tracking:reconcile-shifts` as required runtime and add reconciliation health monitoring guidance
- [x] T056 Run full quality gates: `npx tsc --noEmit && npx eslint . && npx vitest run && npx next build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 for snapped cols, T002 for matchTrajectory)
- **US1 (Phase 3)**: Depends on Foundational completion — batch replay needs event-time signature
- **US2 (Phase 4)**: Depends on Foundational — canonical writes need event-time `passed_at`
- **US3 (Phase 5)**: Depends on Foundational — effective position uses snapped coords from new signature
- **US4 (Phase 6)**: Depends on Foundational + Setup (T001) — source-aligned scoring needs per-ping snapped coords
- **US5 (Phase 7)**: **Fully independent** — can start after Setup (no dependency on Foundational)
- **Polish (Phase 8)**: Depends on all stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational required. No cross-story deps.
- **US2 (P1)**: Foundational required. Benefits from US1 batch replay but independently testable.
- **US3 (P2)**: Foundational required. No cross-story deps.
- **US4 (P2)**: Foundational + Setup required. No cross-story deps.
- **US5 (P3)**: Only Setup (migration) required. Fully independent of other stories.

### Parallel Opportunities

- T001 and T002 can run in parallel (Setup phase)
- T012–T018 (US1 tests) can all run in parallel
- T024–T026 (US2 tests) can all run in parallel
- T032–T036 (US3 tests) can all run in parallel
- T041 and T042 (VanPosition construction sites) can run in parallel
- T043–T045 (US4 tests) can all run in parallel
- T049–T050 (US5 tests) can run in parallel
- US5 can be implemented in parallel with US1–US4

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (migration + matchTrajectory)
2. Complete Phase 2: Foundational (event-time signature)
3. Complete Phase 3: US1 — Batch replay
4. Complete Phase 4: US2 — Canonical writes
5. **STOP and VALIDATE**: Both P1 stories working, no phantom stops, correct event-time semantics

### Incremental Delivery

1. Setup + Foundational → Event-time inference working
2. Add US1 → Batch replay working → Test independently
3. Add US2 → Canonical writes working → Test independently
4. Add US3 → Consistent position → Test independently
5. Add US4 → Source-aligned confidence → Test independently
6. Add US5 → Orphan health visible → Test independently
7. Polish → Full quality gate validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable after Foundational phase
- US5 is fully independent and can be implemented anytime
- Commit after each phase or logical group
- Stop at any checkpoint to validate
