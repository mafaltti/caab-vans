# Tasks: GPS-Distance-Based ETA

**Input**: Design documents from `/specs/021-gps-distance-eta/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the feature specification explicitly defines 8 test cases for GPS ETA behavior.

**Organization**: Tasks are grouped by user story. US1 (live GPS ETA) and US2 (graceful fallback) are implemented together since the GPS branch and fallback are two sides of the same `computeEta()` change. US3 (ETA source transparency) is fully delivered by the type and logic changes in earlier phases — no separate tasks needed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Type & Interface Changes)

**Purpose**: Extend interfaces and types that all subsequent tasks depend on. No logic changes yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Extend `Stop` interface with optional `stopLat`/`stopLng` fields, add `VanPosition` interface, add `etaSource` field to `EtaResult` interface, and add GPS constants (`ROAD_FACTOR = 1.3`, `MIN_SPEED_MPS = 1.0`) in `src/lib/tracking/eta.ts`. For the staleness threshold, reuse `STALENESS_THRESHOLD_MINUTES` already exported from `src/lib/time.ts` (value: 10) — do NOT define a new staleness constant. See data-model.md for field types and contracts/eta-contract.md for interface signatures. Do NOT implement the GPS computation logic yet — only add the type definitions and constants.
- [x] T002 [P] Add `etaSource: "gps" | "schedule" | null` field to the `RouteProgress` type in `src/types/index.ts`. See data-model.md for the field definition.

**Checkpoint**: All interfaces and types are extended. Existing code still compiles (new fields are optional/additive). Run `npx tsc --noEmit` to verify.

---

## Phase 2: User Stories 1 & 2 — GPS-Based ETA with Fallback (Priority: P1)

**Goal**: Compute ETA using the van's real GPS position and speed when conditions are met; fall back to existing schedule-delay logic otherwise.

**Independent Test**: Call `computeEta()` with a `vanPosition` argument — when GPS conditions are met, ETA should reflect haversine distance / speed. When any condition fails, ETA should match the existing schedule-delay behavior.

**Why combined**: US1 (GPS ETA) and US2 (fallback) are two branches of the same conditional in `computeEta()`. They cannot be implemented or tested independently — the fallback IS the else-branch of the GPS check.

### Implementation

- [x] T003 [US1] [US2] Implement GPS distance-based ETA branch in `computeEta()` in `src/lib/tracking/eta.ts`. After finding `nextStop` and before computing `etaDateTime`: check if `vanPosition` exists AND `nextStop` has `stopLat`/`stopLng` AND `speedMps >= MIN_SPEED_MPS` AND location age < `STALENESS_THRESHOLD_MINUTES` (imported from `src/lib/time.ts`). If all conditions met: compute `haversineDistanceMeters(van → nextStop) × ROAD_FACTOR / speedMps / 60` to get travel minutes, set `etaDateTime = now + travelMinutes`, set `etaSource = "gps"`. Otherwise: use existing schedule-delay logic unchanged, set `etaSource = "schedule"`. When no next stop found: set `etaSource = null`. Import `haversineDistanceMeters` from `src/lib/tracking/haversine.ts`. See contracts/eta-contract.md for the full behavior contract.
- [x] T004 [US1] [US2] Add `describe("GPS-based ETA")` test block in `src/__tests__/tracking/eta.test.ts` with 8 test cases: (1) uses GPS when van is moving + fresh location + stop has coords → `etaSource: "gps"` and ETA reflects distance/speed; (2) falls back when speed = 0 → `etaSource: "schedule"`; (3) falls back when speed < MIN_SPEED_MPS → `etaSource: "schedule"`; (4) falls back when location is stale (>10 min) → `etaSource: "schedule"`; (5) falls back when stop has no coords → `etaSource: "schedule"`; (6) falls back when `vanPosition` is null → `etaSource: "schedule"`; (7) returns ~0 min ETA when van is at the stop; (8) verify existing tests still pass with `vanPosition` not provided (backward compat → `etaSource: "schedule"`). Use the same test patterns as the existing test block (direct Luxon `DateTime` objects, `America/Bahia` timezone). Use realistic coordinates (e.g., Salvador, Bahia area) for distance calculations.
- [x] T005 [P] [US1] [US2] Wire `vanPosition` and stop coordinates in route detail endpoint `src/app/api/routes/[routeId]/route.ts`: (1) add `last_speed_mps` to the van SELECT query; (2) add `stop_lat`, `stop_lng` to the `schedule_entries` fields in the `route_run_stops` join; (3) build a `VanPosition` object from van data (`last_lat`, `last_lng`, `last_speed_mps`, `location_updated_at` parsed as Luxon DateTime); (4) pass `stopLat`/`stopLng` when mapping stops for `computeEta()`; (5) pass `vanPosition` to `computeEta()`; (6) include `etaSource` in the progress response object.
- [x] T006 [P] [US1] [US2] Wire `vanPosition` and stop coordinates in route list endpoint `src/app/api/routes/route.ts`: same 6 changes as T005 — (1) add `last_speed_mps` to van SELECT; (2) add `stop_lat`, `stop_lng` to schedule_entries join; (3) build `VanPosition`; (4) pass stop coords to `computeEta()`; (5) pass `vanPosition`; (6) include `etaSource` in progress response.

**Checkpoint**: GPS-based ETA works end-to-end. Run `npx vitest run src/__tests__/tracking/eta.test.ts` — all 8 new + 9 existing tests pass. US1, US2, and US3 are all delivered.

---

## Phase 3: User Story 3 — ETA Source Transparency (Priority: P2)

**Note**: US3 is fully delivered by Phases 1 and 2. The `etaSource` field is:
- Defined in types (T001, T002)
- Set by computation logic (T003 — `"gps"`, `"schedule"`, or `null`)
- Included in API responses (T005, T006)

No additional tasks needed. US3 acceptance scenarios are verified by the same tests in T004.

---

## Phase 4: Polish & Validation

**Purpose**: Run all quality gates to confirm the feature is ready for PR.

- [x] T007 Run full quality gate suite: `npx vitest run` (all tests pass), `npx tsc --noEmit` (no type errors), `npx next build` (builds clean), `npx eslint .` (no lint errors). Fix any issues found.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **US1 & US2 (Phase 2)**: Depends on Phase 1 completion (interfaces must exist before logic)
- **US3 (Phase 3)**: No tasks — delivered by Phases 1-2
- **Polish (Phase 4)**: Depends on Phase 2 completion

### Task Dependencies

```text
T001 ──┬──→ T003 ──→ T004
       │         ├──→ T005 ──┐
T002 ──┘         └──→ T006 ──┼──→ T007
                              │
```

- T001, T002: parallel (different files)
- T003: depends on T001 (needs interfaces/constants)
- T004: depends on T003 (tests need the logic to exist)
- T005, T006: parallel (different files), depend on T003 (need `computeEta()` to accept `vanPosition`)
- T007: depends on T004, T005, T006

### Parallel Opportunities

```bash
# Phase 1 — both in parallel:
T001: Extend interfaces in src/lib/tracking/eta.ts
T002: Add etaSource to RouteProgress in src/types/index.ts

# Phase 2 — after T003 completes, T005 and T006 in parallel:
T005: Wire route detail endpoint
T006: Wire route list endpoint
```

---

## Implementation Strategy

### MVP First (Recommended)

1. Complete Phase 1: Type changes (T001, T002 in parallel)
2. Complete T003: Core GPS logic in `computeEta()`
3. Complete T004: Verify with tests
4. Complete T005, T006 in parallel: API wiring
5. Complete T007: Quality gates
6. **All 3 user stories delivered in a single pass**

### Why No Incremental Delivery

This feature is small enough (7 tasks, 5 files) to deliver atomically. US1, US2, and US3 share the same code paths — splitting delivery would not reduce risk or provide useful intermediate milestones.

---

## Notes

- [P] tasks = different files, no dependencies
- [US1] [US2] label on same tasks = stories are inseparable in implementation
- US3 has no dedicated tasks — it's a natural byproduct of the type + logic changes
- Commit after each phase or logical group
- Existing 9 tests must continue passing unchanged (backward compatibility)
