# Tasks: Fix ETA Computation

**Input**: Design documents from `/specs/044-fix-eta-computation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included inline with each user story — existing test suite has 29 ETA tests that must be updated alongside implementation.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 but US2 (OSRM duration) is the most impactful single fix and has no dependencies, so it comes first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Changes)

**Purpose**: Extend the `computeEta()` interface and add constants needed by all three fixes

**⚠️ CRITICAL**: All user story work depends on this phase

- [x] T001 Add `PROXIMITY_THRESHOLD_M = 500` and `FALLBACK_SPEED_MPS = 4.2` constants in `src/lib/tracking/eta.ts`
- [x] T002 Extend `computeEta()` args interface to accept optional `recentSpeeds?: number[]` parameter in `src/lib/tracking/eta.ts`

**Checkpoint**: `computeEta()` signature updated, constants defined. Existing tests still pass (new param is optional).

---

## Phase 2: User Story 2 - Stable ETAs with OSRM Duration (Priority: P1) 🎯 MVP

**Goal**: Use OSRM travel duration as base ETA instead of dividing road distance by instantaneous speed. Eliminates wild ETA swings (4-13 min → stable ~3 min).

**Independent Test**: With OSRM available, consecutive ETA readings for the same stop do not vary by more than 2 minutes within a 1-minute window.

### Implementation for User Story 2

- [x] T003 [US2] In the GPS branch of `computeEta()`, when OSRM result is available, set `baseTravelMinutes = osrmResult.durationSeconds / 60` instead of `distanceMeters / vanPosition.speedMps / 60` in `src/lib/tracking/eta.ts` (around line 112)
- [x] T004 [US2] Keep `timeFactor` multiplication applied to the OSRM-based `baseTravelMinutes` (existing line ~113 — no change needed, just verify it still applies)
- [x] T005 [US2] Update debug logging to include `osrmDurationSeconds` and the new `baseTravelMinutes` source in `src/lib/tracking/eta.ts` (around lines 122-133)
- [x] T006 [US2] Update existing OSRM-related tests and add new test case: when OSRM returns `durationSeconds`, verify `baseTravelMinutes` uses duration instead of distance/speed in `src/__tests__/tracking/eta.test.ts`
- [x] T007 [US2] Add test case: consecutive ETA computations with same OSRM duration but different van speeds produce the same base ETA in `src/__tests__/tracking/eta.test.ts`

**Checkpoint**: OSRM duration is used as base ETA. ETA stability verified by tests. Haversine fallback path unchanged.

---

## Phase 3: User Story 1 - Proximity ETA at Speed=0 (Priority: P1)

**Goal**: When a van is within 500m of a stop and stationary, show proximity-based ETA (~2 min) instead of schedule fallback (8+ min).

**Independent Test**: Van within 500m at speed=0 shows ETA ≤ 3 minutes.

### Implementation for User Story 1

- [x] T008 [US1] Refactor GPS branch entry condition in `computeEta()`: allow entry when `speedMps < MIN_SPEED_MPS` AND `haversineDistanceMeters(van, nextStop) <= PROXIMITY_THRESHOLD_M` in `src/lib/tracking/eta.ts` (around line 74-83)
- [x] T009 [US1] When entering GPS branch via proximity path (speed < MIN_SPEED_MPS), use `FALLBACK_SPEED_MPS` (4.2 m/s) in place of `vanPosition.speedMps` for haversine-based ETA calculation in `src/lib/tracking/eta.ts`
- [x] T010 [US1] When entering via proximity AND OSRM is available, use OSRM duration directly (no speed needed) — verify this path works correctly with T003 changes in `src/lib/tracking/eta.ts`
- [x] T011 [US1] Add test: van at speed=0, within 500m of stop → ETA uses proximity fallback, result ≤ 3 minutes in `src/__tests__/tracking/eta.test.ts`
- [x] T012 [US1] Add test: van at speed=0, beyond 500m of stop → schedule fallback (existing behavior preserved) in `src/__tests__/tracking/eta.test.ts`
- [x] T013 [US1] Add test: van at exactly 500m from stop with speed=0 → proximity fallback applies (inclusive threshold) in `src/__tests__/tracking/eta.test.ts`

**Checkpoint**: Stationary vans near stops show accurate proximity-based ETAs. Distant stationary vans still use schedule fallback.

---

## Phase 4: User Story 3 - Smoothed Speed Fallback (Priority: P2)

**Goal**: When OSRM is unavailable, use smoothed speed (avg of last 10 pings) instead of instantaneous GPS speed for haversine ETA.

**Independent Test**: Brief speed fluctuation does not cause ETA to change by more than 50%.

### Implementation for User Story 3

- [x] T014 [US3] Add helper function `computeSmoothedSpeed(recentSpeeds: number[]): number` in `src/lib/tracking/eta.ts` — returns mean of non-zero values, or 0 if all are zero/empty
- [x] T015 [US3] In the haversine fallback path of `computeEta()`, when `recentSpeeds` is provided and has non-zero values, use `computeSmoothedSpeed()` instead of `vanPosition.speedMps` for `baseTravelMinutes` calculation in `src/lib/tracking/eta.ts`
- [x] T016 [US3] When smoothed speed is 0 (all pings are 0), apply same proximity/schedule fallback logic from US1 in `src/lib/tracking/eta.ts`
- [x] T017 [P] [US3] Add recent pings query to route detail API: query last 10 `van_location_pings` by `device_ts DESC` for the van, extract `speed_mps` values, pass as `recentSpeeds` to `computeEta()` in `src/app/api/routes/[routeId]/route.ts`
- [x] T018 [P] [US3] Add same recent pings query to routes list API: for each van, query last 10 pings and pass `recentSpeeds` to `computeEta()` in `src/app/api/routes/route.ts`
- [x] T019 [US3] Add test: `computeSmoothedSpeed([5, 3, 7, 0, 4, 6, 0, 5, 3, 4])` returns mean of non-zero values in `src/__tests__/tracking/eta.test.ts`
- [x] T020 [US3] Add test: haversine fallback with smoothed speed — brief speed drop does not cause ETA spike > 50% in `src/__tests__/tracking/eta.test.ts`
- [x] T021 [US3] Add test: all recent speeds are 0, within 500m → proximity fallback used in `src/__tests__/tracking/eta.test.ts`
- [x] T022 [US3] Add test: `computeSmoothedSpeed` with only 2 readings (partial window) returns correct mean in `src/__tests__/tracking/eta.test.ts`

**Checkpoint**: Haversine fallback ETAs are smooth. API routes pass recent speed data. All three fixes work together.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates, regression verification, cleanup

- [x] T023 Run full test suite (`npm test`) and verify all 29+ existing tests still pass alongside new tests in `src/__tests__/tracking/eta.test.ts`
- [x] T024 Run lint (`npx eslint src/lib/tracking/eta.ts src/app/api/routes/`) and fix any issues
- [x] T025 Run type check (`npx tsc --noEmit`) and fix any errors
- [x] T026 Run build (`npm run build`) and verify success
- [x] T027 Verify FR-007: confirm no changes to geofence, stop advancement, or route tracking files — `src/lib/tracking/infer-stop-progress.ts` and `src/lib/tracking/run-status.ts` are unmodified

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US2 (Phase 2)**: Depends on Phase 1 (constants + interface)
- **US1 (Phase 3)**: Depends on Phase 1 (constants + interface). Independent of US2 but benefits from US2's OSRM duration for the proximity+OSRM path.
- **US3 (Phase 4)**: Depends on Phase 1 (interface extension). Independent of US1/US2 but integrates with US1's fallback logic.
- **Polish (Phase 5)**: Depends on all user stories complete

### User Story Dependencies

- **US2 (P1)**: Can start after Phase 1 — no dependencies on other stories. **Best MVP candidate.**
- **US1 (P1)**: Can start after Phase 1 — logically benefits from US2 (OSRM duration at speed=0) but is independently testable
- **US3 (P2)**: Can start after Phase 1 — benefits from US1 (proximity fallback for zero smoothed speed) but is independently testable

### Within Each User Story

- Implementation tasks are sequential (same file: `eta.ts`)
- Test tasks follow their corresponding implementation task
- API route tasks in US3 (T017, T018) are parallel with each other

### Parallel Opportunities

- T017 and T018 (API route changes) can run in parallel
- US2 and US3 could theoretically run in parallel (different code paths in eta.ts), but sequential is safer since they touch the same file
- All Phase 5 quality gate tasks are sequential (each may produce fixes)

---

## Parallel Example: User Story 3

```bash
# These two API route tasks can run in parallel (different files):
Task T017: "Add recent pings query to route detail API in src/app/api/routes/[routeId]/route.ts"
Task T018: "Add recent pings query to routes list API in src/app/api/routes/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 2 Only)

1. Complete Phase 1: Foundational (T001-T002)
2. Complete Phase 2: US2 — OSRM Duration (T003-T007)
3. **STOP and VALIDATE**: Run tests, verify ETA stability with OSRM
4. This single change eliminates the biggest ETA problem (4-13 min swings → stable ~3 min)

### Incremental Delivery

1. Phase 1 → Foundation ready
2. Phase 2: US2 (OSRM duration) → Test → Most impactful fix shipped
3. Phase 3: US1 (proximity at speed=0) → Test → Stationary van fix shipped
4. Phase 4: US3 (smoothed speed) → Test → Haversine fallback improved
5. Phase 5: Polish → Quality gates verified → PR ready

---

## Notes

- All three fixes touch `src/lib/tracking/eta.ts` — avoid parallel edits to this file
- OSRM client (`osrm.ts`) needs NO changes — `durationSeconds` is already returned
- No database migration required — uses existing `van_location_pings` table and index
- Existing 29 tests must continue passing after each phase
- Commit after each phase checkpoint for clean git history
