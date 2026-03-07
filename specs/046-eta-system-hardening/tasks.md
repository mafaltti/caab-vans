# Tasks: ETA System Hardening

**Input**: Design documents from `/specs/046-eta-system-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Test updates are included where existing tests need modification (eta.test.ts).

**Organization**: Tasks grouped by user story. US1-US2 are P1, US3-US4 are P2, US5-US7 are P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project initialization needed — all changes are within the existing codebase. This phase covers the one shared schema change.

- [x] T001 Create migration file `supabase/migrations/XXXXX_add_osrm_distance.sql` adding nullable `osrm_distance_m double precision` column to `schedule_entries` table
- [x] T002 Apply migration to local Supabase instance and verify column exists

**Checkpoint**: Schema ready for pre-computed distances

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared utilities and interface changes needed by multiple user stories

**Note**: No blocking prerequisites exist — US1-US7 are independent. Proceed directly to user stories.

---

## Phase 3: User Story 1 - Stable ETA During Stop-and-Go Traffic (Priority: P1) MVP

**Goal**: Add hysteresis to prevent jarring GPS→Schedule ETA transitions when the van briefly stops at traffic lights or for passenger boarding. ETA should change smoothly rather than jumping 40-50%.

**Independent Test**: Simulate a van that stops for 30-60 seconds at a traffic light (speed drops to 0, distance > 500m from stop) and verify the ETA stays GPS-based with fallback speed during the grace period, then transitions to schedule after 60s.

**Spec References**: FR-001, FR-002, SC-001

### Implementation for User Story 1

- [x] T003 [US1] Update `recentSpeeds` query in `src/app/api/routes/[routeId]/route.ts` to select `speed_mps, device_ts` instead of only `speed_mps`. Transform the result into an array of `{speedMps, deviceTs}` objects instead of bare numbers. Pass both speeds and timestamps to `computeEta()`.

- [x] T004 [US1] Update `recentSpeeds` query in `src/app/api/routes/route.ts` with the same changes as T003 (select `speed_mps, device_ts`, pass objects to `computeEta()`).

- [x] T005 [US1] Update `computeEta()` signature in `src/lib/tracking/eta.ts`: change `recentSpeeds?: number[]` parameter to `recentSpeeds?: Array<{speedMps: number; deviceTs: string}>`. Add a `HYSTERESIS_WINDOW_S = 60` constant. Before the `gpsConditionsMet` check, compute `recentlyMoving`: check if any ping in `recentSpeeds` within the last 60 seconds (relative to `now`) has `speedMps >= MIN_SPEED_MPS`. Update `gpsConditionsMet` to: `hasCoords && locationFresh && (isMoving || isNearStop || recentlyMoving)`. When `recentlyMoving` is true but `isMoving` is false and `isNearStop` is false, use `FALLBACK_SPEED_MPS` as `effectiveSpeed`.

- [x] T006 [US1] Update `computeSmoothedSpeed()` call site in `src/lib/tracking/eta.ts` to extract speed values from the new `recentSpeeds` object format: `args.recentSpeeds.map(p => p.speedMps)` before passing to the smoothing function.

- [x] T007 [US1] Update existing hysteresis-related test cases in `src/lib/tracking/__tests__/eta.test.ts`: add test for van at >500m, speed=0, recent pings within 60s with speed>=1.0 → should return GPS-based ETA with fallback speed. Add test for van at >500m, speed=0, all recent pings older than 60s → should return schedule-based ETA.

**Checkpoint**: Van briefly stopping at traffic light keeps GPS-based ETA. ETA changes by <30% during a 45-second stop.

---

## Phase 4: User Story 2 - Resilient Speed Smoothing (Priority: P1)

**Goal**: Replace arithmetic mean with median in speed smoothing so a single GPS spike does not corrupt the ETA.

**Independent Test**: Pass speed readings `[5, 6, 5, 40, 6, 5, 4, 6, 5, 6]` (one spike) and verify smoothed speed is ~5.5 m/s, not ~8.8 m/s.

**Spec References**: FR-003, SC-002

### Implementation for User Story 2

- [x] T008 [P] [US2] Rewrite `computeSmoothedSpeed()` in `src/lib/tracking/eta.ts` (lines 37-41) to use median instead of arithmetic mean: filter non-zero speeds, sort ascending, return middle value (or average of two middle values for even count). Keep returning 0 when all speeds are zero.

- [x] T009 [US2] Update the `computeSmoothedSpeed` test in `src/lib/tracking/__tests__/eta.test.ts`: change assertion from `toBeCloseTo(4.625)` (mean of [3,5,2,8]) to `toBeCloseTo(4.0)` (median: sorted [2,3,5,8], avg of 3 and 5). Add test with spike: `[5, 6, 5, 40, 6, 5, 4, 6, 5, 6]` → result within 10% of 5.5.

**Checkpoint**: GPS speed spikes cause <10% deviation in smoothed speed.

---

## Phase 5: User Story 3 - Accurate Congestion Factor Early in Route (Priority: P2)

**Goal**: Prevent noisy timeFactor blending when only 1-2 stop segments have been passed. Require minimum 3 segments.

**Independent Test**: Call `getTimeFactor()` with `recentRuns` of length 1 or 2 and verify it returns only the historical factor (no blending).

**Spec References**: FR-004, SC-003

### Implementation for User Story 3

- [x] T010 [P] [US3] In `getTimeFactor()` in `src/lib/tracking/time-factors.ts` (line 132), change condition from `recentRuns && recentRuns.length > 0` to `recentRuns && recentRuns.length >= 3`. Add a `MIN_BLEND_SEGMENTS = 3` exported constant above the function.

- [x] T011 [US3] Add test in `src/lib/tracking/__tests__/eta.test.ts` (or a new `time-factors.test.ts`): verify `getTimeFactor()` with 1 and 2 `recentRuns` returns the historical factor unchanged, and with 3+ runs it blends 70/30.

**Checkpoint**: ETA congestion factor during first 3 stops matches historical baseline within 5%.

---

## Phase 6: User Story 4 - Consistent Distance Computation (Priority: P2)

**Goal**: Align runtime `buildRecentRuns()` with the training script by using pre-computed OSRM distances instead of haversine.

**Independent Test**: Compute a recent-run factor for a known stop pair with pre-computed OSRM distance and verify the predicted-minutes matches the training script's prediction within 5%.

**Spec References**: FR-005, SC-004

### Implementation for User Story 4

- [x] T012 [P] [US4] Create `scripts/precompute-stop-distances.ts`: standalone script that queries all `schedule_entries` ordered by route and time, fetches OSRM road distance for each consecutive stop pair, and updates `schedule_entries.osrm_distance_m` for the "from" stop in each pair. Use the same OSRM call pattern as `compute-time-factors.ts`. Requires `DATABASE_URL` and `OSRM_BASE_URL` env vars.

- [x] T013 [P] [US4] Update `buildRecentRuns()` signature in `src/lib/tracking/time-factors.ts` to accept an optional `osrmDistances?: Map<string, number>` parameter (keyed by schedule_entry_id). When an OSRM distance is available for a stop pair, use it instead of `haversineDistanceMeters * roadFactor`. Fall back to haversine when not available.

- [x] T014 [US4] Update both API route files (`src/app/api/routes/[routeId]/route.ts` and `src/app/api/routes/route.ts`) to query `osrm_distance_m` from `schedule_entries` and pass the distances map to `buildRecentRuns()`.

**Checkpoint**: Runtime congestion factor ratio matches training script within 5% for same stop pair.

---

## Phase 7: User Story 5 - Clean Codebase and Documented Constants (Priority: P3)

**Goal**: Remove dead code, unify constants, document magic numbers, and gate debug logging.

**Independent Test**: Code review — no dead assignments, consistent constants, documented rationale, no unconditional hot-path logging.

**Spec References**: FR-006, FR-007, FR-008, FR-009, SC-005, SC-006, SC-007

### Implementation for User Story 5

- [x] T015 [US5] Clean up `src/lib/tracking/eta.ts` — three changes in one edit session: (a) Remove dead `distanceMeters` assignment in OSRM branch (currently at line 96 `let distanceMeters: number` and line 110 `distanceMeters = osrmResult.distanceMeters`; restructure so `distanceMeters` is only declared and assigned in the haversine fallback `else` block). (b) Document `FALLBACK_SPEED_MPS` (line 35) with inline comment: `// ~15 km/h — urban crawling speed estimate, used when van is stationary but GPS branch is active (proximity or hysteresis grace period)`. (c) Gate the verbose `console.log` block (lines 147-159) behind `process.env.DEBUG_ETA`: wrap with `if (process.env.DEBUG_ETA) { ... }`.

- [x] T016 [P] [US5] Unify `REFERENCE_SPEED_MPS` in `scripts/compute-time-factors.ts` (line 33): change `DEFAULT_SPEED_MPS = 8.33` to `DEFAULT_SPEED_MPS = 8.3`. Add comment: `// ~30 km/h — must match REFERENCE_SPEED_MPS in src/lib/tracking/time-factors.ts`.

**Checkpoint**: No dead code, constants unified at 8.3, FALLBACK_SPEED documented, zero logs/hour by default.

---

## Phase 8: User Story 6 - Data-Driven Time-of-Day Factors (Priority: P3)

**Goal**: Add Sunday baseline factors and document calibration script usage.

**Independent Test**: Verify Sunday hours return a non-1.0 factor from defaults. Verify calibration script runs successfully against historical data.

**Spec References**: FR-010, FR-011, SC-005

### Implementation for User Story 6

- [x] T019 [P] [US6] Add `DEFAULT_SUNDAY_FACTORS` in `src/lib/tracking/time-factors.ts`: define Sunday baseline factors `{"7": 0.95, "8": 0.95, "9": 0.95, "16": 0.95, "17": 0.95, "18": 0.95}` for operating hours. Update `DEFAULT_FACTORS.global.sunday` from `{}` to use this new constant.

- [x] T020 [P] [US6] Ensure `data/` directory is in `.gitignore` so generated `time-factors.json` is not committed. Verify by checking `.gitignore` and adding `data/time-factors.json` if not already ignored.

- [x] T021 [US6] Verify `scripts/compute-time-factors.ts` runs without errors against the current database schema. Fix any issues found. Confirm it writes `data/time-factors.json` correctly.

**Checkpoint**: Sunday returns 0.95 factor for operating hours. Calibration script can be run manually.

---

## Phase 9: User Story 7 - Direction-Aware Haversine Fallback (Priority: P3)

**Goal**: Detect when a van is moving away from the next stop in the haversine fallback path and fall back to schedule-based ETA.

**Independent Test**: Provide GPS positions showing the van heading away from the stop (bearing difference > 90 degrees) with OSRM unavailable, and verify schedule-based ETA is returned.

**Spec References**: FR-012

### Implementation for User Story 7

- [x] T022 [P] [US7] Add `computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number` function to `src/lib/tracking/haversine.ts`: returns initial bearing in degrees (0-360) from point 1 to point 2 using the standard atan2 formula.

- [x] T023 [P] [US7] Add optional `headingDeg?: number | null` field to `VanPosition` interface in `src/lib/tracking/eta.ts`. Add `DIRECTION_THRESHOLD_DEG = 90` constant.

- [x] T024 [US7] In the haversine fallback path of `computeEta()` in `src/lib/tracking/eta.ts` (the `else` block around lines 112-119): after computing haversine distance, if `vanPosition.headingDeg` is available, compute bearing from van to next stop using `computeBearing()`. If angular difference between heading and bearing exceeds `DIRECTION_THRESHOLD_DEG`, skip the GPS branch entirely (break out and fall through to schedule-delay fallback). Use modular arithmetic for angle comparison: `Math.min(Math.abs(diff), 360 - Math.abs(diff))`.

- [x] T025 [US7] Update both API route files (`src/app/api/routes/[routeId]/route.ts` and `src/app/api/routes/route.ts`) to include `heading_deg` from the `vans` table when constructing the `VanPosition` object passed to `computeEta()`.

- [x] T026 [US7] Add test in `src/lib/tracking/__tests__/eta.test.ts`: van heading 180 degrees away from stop, OSRM unavailable → should return schedule-based ETA. Van heading toward stop → should return GPS-based ETA.

**Checkpoint**: Haversine fallback detects wrong-direction travel and uses schedule ETA instead.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and quality checks

- [x] T027 Run full test suite: `npx vitest run` — all tests must pass
- [x] T028 Run lint and typecheck: `npm run lint && npx tsc --noEmit` — zero errors
- [x] T029 Run build: `npm run build` — must succeed
- [x] T030 Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — migration first
- **Phase 2 (Foundational)**: Skipped — no blocking prerequisites
- **Phases 3-4 (P1 stories)**: Can start after Phase 1 (US1 and US2 are independent)
- **Phases 5-6 (P2 stories)**: Can start after Phase 1 (US3 and US4 are independent)
- **Phases 7-9 (P3 stories)**: Can start after Phase 1 (US5, US6, US7 are independent)
- **Phase 10 (Polish)**: After all user stories complete

### User Story Dependencies

- **US1 (Hysteresis)**: Independent. Changes `computeEta()` signature for `recentSpeeds`.
- **US2 (Median Speed)**: Independent. Changes `computeSmoothedSpeed()` internals only.
- **US3 (N>=3 Gate)**: Independent. Changes `getTimeFactor()` condition only.
- **US4 (OSRM Distances)**: Depends on T001 migration. Changes `buildRecentRuns()` signature.
- **US5 (Cleanup)**: Independent. Touches different lines than US1/US2.
- **US6 (Sunday Factors)**: Independent. Changes defaults in `time-factors.ts`.
- **US7 (Direction)**: Independent. Adds new code path in haversine fallback.

**Merge order recommendation**: US5 (cleanup) first to reduce merge conflicts, then US2, US3, US1, US4, US6, US7.

### Within Each User Story

- Implementation tasks in listed order (some marked [P] for parallelism)
- API route changes depend on core logic changes
- Tests depend on implementation being complete

### Parallel Opportunities

**Within P1 stories** (after Phase 1):
```
US1 (T003-T007) ─── in parallel with ─── US2 (T008-T009)
```

**Within P2 stories** (after Phase 1):
```
US3 (T010-T011) ─── in parallel with ─── US4 (T012-T014)
```

**Within P3 stories** (after Phase 1):
```
US5 (T015-T018) ─── in parallel with ─── US6 (T019-T021) ─── in parallel with ─── US7 (T022-T026)
```

**Within US5** (two tasks, different files):
```
T015 (eta.ts: dead code + fallback doc + log gate) ║ T016 (constant, compute-time-factors.ts)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Migration
2. Complete Phase 3: US1 (Hysteresis) — eliminates the most visible user-facing issue
3. Complete Phase 4: US2 (Median Speed) — prevents GPS spike corruption
4. **STOP and VALIDATE**: Test with simulated traffic stops and speed spikes
5. Deploy to DEV

### Incremental Delivery

1. US5 (Cleanup) → immediate code quality win, low risk
2. US1 + US2 (P1) → highest user impact
3. US3 + US4 (P2) → congestion factor accuracy
4. US6 + US7 (P3) → calibration and edge case handling
5. Each story independently testable and deployable

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- T015 batches three `eta.ts` changes (dead code, FALLBACK_SPEED doc, debug log gate) into one edit session to avoid merge conflicts
- T003 and T004 are identical changes in two API route files — can be done in one commit
- T014 and T025 both modify the same two API route files — order matters if done by different agents
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
