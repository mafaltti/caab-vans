# Tasks: OSRM Route-Based ETA

**Input**: Design documents from `specs/037-osrm-eta-baseline/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks are grouped by user story. US1+US2+US5 are combined into a single phase because they modify the exact same function (`computeEta`) and are inseparable in implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Prepare repository for new files and generated artifacts

- [x] T001 Add `data/` directory to `.gitignore` (generated time-factors.json should not be committed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core building blocks that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add `osrmRoute()` function and `OsrmRouteResult` interface to `src/lib/tracking/osrm.ts` — point-to-point road distance via OSRM `/route/v1/driving/` endpoint with 100ms timeout, returns `{ distanceMeters, durationSeconds }` or `null` on any failure
- [x] T003 [P] Add `"gps_osrm"` to the `etaSource` union type in `src/types/index.ts` — update both `RouteProgress.etaSource` and `EtaResult.etaSource` (in `eta.ts`) to `"gps" | "gps_osrm" | "schedule" | null`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: US1 + US2 + US5 — Road Distance ETA with Fallback and Source Tracking (Priority: P1)

**Goal**: Replace `haversine × 1.3 / gpsSpeed` with `osrmDistance / gpsSpeed`, falling back to haversine when OSRM is unavailable, and exposing which method was used via `etaSource`

**Independent Test**: With OSRM running: API returns `etaSource: "gps_osrm"` and ETAs reflect road distance. With OSRM stopped: API returns `etaSource: "gps"` and uses haversine × 1.3. Without `OSRM_BASE_URL` env var: behavior identical to before.

**Why combined**: US1 (road distance), US2 (fallback), and US5 (source transparency) all modify the same GPS branch in `computeEta`. Implementing one without the others leaves the code in an incomplete state. The fallback IS the OSRM branch — `osrmResult ? osrmDistance : haversine × 1.3`. The source tracking IS the `etaSource` assignment in that same branch.

### Implementation

- [x] T004 [US1] [US2] [US5] Make `computeEta` async and add OSRM-first GPS branch in `src/lib/tracking/eta.ts` — add `osrmBaseUrl?: string` param, call `osrmRoute()` when available, fall back to haversine × ROAD_FACTOR when OSRM fails/times out/not configured, set `etaSource: "gps_osrm"` or `"gps"` accordingly. Return type becomes `Promise<EtaResult>`.
- [x] T005 [P] [US1] [US2] Update route list endpoint in `src/app/api/routes/route.ts` — add `await` before `computeEta()`, pass `osrmBaseUrl: process.env.OSRM_BASE_URL` to the call
- [x] T006 [P] [US1] [US2] Update single route endpoint in `src/app/api/routes/[routeId]/route.ts` — add `await` before `computeEta()`, pass `osrmBaseUrl: process.env.OSRM_BASE_URL` to the call

**Checkpoint**: OSRM road distance ETA works end-to-end. Fallback chain is complete. `etaSource` distinguishes `gps_osrm` from `gps`. System is backward-compatible when `OSRM_BASE_URL` is not set.

---

## Phase 4: US3 — Rush Hour ETA Correction (Priority: P1)

**Goal**: Apply time-of-day correction factors to GPS-based ETAs (both OSRM and haversine), with hardcoded defaults for day-one accuracy

**Independent Test**: Compare ETAs at 8 AM vs 11 AM for the same van position/speed — rush hour ETA should be ~35-40% higher due to the correction factor.

### Implementation

- [x] T007 [US3] Create time-factors module in `src/lib/tracking/time-factors.ts` — implement `getTimeFactor(hour, dayOfWeek, routeId?)` returning a correction multiplier, `loadFactors()` reading from `data/time-factors.json` with fallback to hardcoded defaults (`DEFAULT_WEEKDAY_FACTORS`), day type derivation (weekday/saturday/sunday). Include hardcoded defaults: weekday 7AM=1.35, 8AM=1.40, 17PM=1.35, 18PM=1.30, off-peak=1.0, weekend=1.0-1.10. Ensure `loadFactors()` reads the file on each invocation (no long-lived cache) so that nightly script updates take effect without restart (FR-014).
- [x] T008 [US3] Integrate time factor into `computeEta` GPS branches in `src/lib/tracking/eta.ts` — after computing `baseTravelMinutes = distanceMeters / speedMps / 60`, multiply by `getTimeFactor(now.hour, now.weekday, routeId)`. Apply to BOTH the OSRM branch and haversine fallback branch. Add `routeId?: string` param to `computeEta`. Do NOT apply factor to the schedule fallback (it already incorporates observed delay).

**Checkpoint**: Rush hour ETAs are higher than off-peak. System works from day one with seeded defaults. Missing `data/time-factors.json` causes no errors.

---

## Phase 5: US4 — Today's Conditions Override Historical Averages (Priority: P2)

**Goal**: Blend recent observations from today's completed trips into the correction factor, capturing day-specific anomalies (rain, events, unusual congestion)

**Independent Test**: If morning runs were 30% slower than predicted, afternoon ETAs should use a higher correction factor than the historical default alone.

### Implementation

- [x] T009 [US4] Add recency blending to `getTimeFactor` in `src/lib/tracking/time-factors.ts` — add `recentRuns?: { actualMinutes: number; predictedMinutes: number }[]` param, implement `computeRecentFactor()` using median of actual/predicted ratios, blend 70% historical + 30% recent when recent data exists, use 100% historical when no today's runs available
- [x] T010 [US4] Query today's completed run segments and pass to `computeEta` in `src/app/api/routes/route.ts` and `src/app/api/routes/[routeId]/route.ts` — for each route with an active run, query today's completed `route_run_stops` (status='passed') with `passed_at` timestamps, compute actual vs predicted travel times for consecutive stop pairs, pass as `recentRuns` array to `computeEta`. Per constitution DRY rule (extract after 3+ repetitions), duplicate the query logic in both endpoints rather than extracting a shared helper

**Checkpoint**: Recency blending works. First run of the day uses 100% historical. Later runs incorporate today's observations. Factor blends correctly (70/30).

---

## Phase 6: US6 — Comparison Logging for Accuracy Measurement (Priority: P3)

**Goal**: Log both old and new ETA calculations side by side for accuracy comparison and future factor refinement

**Independent Test**: Trigger an ETA calculation with OSRM available and check server logs for structured JSON entries with both haversine and OSRM distances.

### Implementation

- [x] T011 [US6] Add structured comparison logging to `computeEta` GPS branch in `src/lib/tracking/eta.ts` — after computing final ETA, emit `console.log(JSON.stringify({ event: "eta_comparison", routeId, stopId, haversine: { distanceM, travelMinutes }, osrm: { distanceM, durationS } | null, timeFactor, finalTravelMinutes, gpsSpeedMps, chosen: etaSource, timestamp }))`. Always compute haversine distance for logging even when OSRM is used.

**Checkpoint**: Structured logs appear in server output with both calculation methods' results.

---

## Phase 7: US7 — Automatic Factor Refinement from Trip Data (Priority: P3)

**Goal**: Nightly script that compares predicted vs actual travel times and outputs refined correction factors to `data/time-factors.json`

**Independent Test**: Run the script manually against existing trip data and verify it produces a valid `data/time-factors.json` with factors grouped by day type and hour.

### Implementation

- [x] T012 [US7] Create nightly factor computation script in `scripts/compute-time-factors.ts` — connect to Postgres via `DATABASE_URL`, query `route_run_stops` with `passed_at` from last 30 days joined with `schedule_entries` for coordinates, for each consecutive stop pair compute actual travel time (passed_at difference) and predicted travel time (OSRM distance / average GPS speed from `van_location_pings`), compute correction_factor = actual / predicted, aggregate by (dayType, hour) using median, require minimum 20 observations per bucket before overriding defaults, produce per-route overrides when route variance exceeds 15%, write output to `data/time-factors.json` matching the schema in data-model.md

**Checkpoint**: Script runs successfully, produces valid JSON, factors differ from defaults when sufficient data exists.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T013 Run quality gates: `npx eslint .`, `npx tsc --noEmit`, `npx next build`
- [x] T014 Run quickstart.md verification checklist — verify all 6 items pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1+US2+US5 (Phase 3)**: Depends on Foundational (T002, T003)
- **US3 (Phase 4)**: Depends on Phase 3 (time factor multiplies the base ETA from Phase 3)
- **US4 (Phase 5)**: Depends on Phase 4 (recency blending extends `getTimeFactor` from Phase 4)
- **US6 (Phase 6)**: Depends on Phase 3 (logging references both OSRM and haversine values)
- **US7 (Phase 7)**: Depends on Phase 4 (script outputs the same JSON schema that `loadFactors` reads)
- **Polish (Phase 8)**: Depends on all previous phases

### User Story Dependencies

- **US1+US2+US5 (P1)**: Can start after Foundational — no other story dependencies
- **US3 (P1)**: Depends on US1+US2+US5 (needs the async OSRM branch to multiply)
- **US4 (P2)**: Depends on US3 (extends `getTimeFactor` with recency param)
- **US6 (P3)**: Depends on US1+US2+US5 only (logging is independent of time factors)
- **US7 (P3)**: Depends on US3 only (script produces the JSON that `loadFactors` reads)

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T005 and T006 can run in parallel (different files, both depend on T004)
- US6 (Phase 6) and US4 (Phase 5) can run in parallel (independent after Phase 3/4)
- US7 (Phase 7) and US4 (Phase 5) can run in parallel (independent after Phase 4)

```
Phase 1: T001
           │
Phase 2: T002 ═══╗
         T003 ═══╝ (parallel)
           │
Phase 3: T004
         T005 ═══╗
         T006 ═══╝ (parallel, after T004)
           │
Phase 4: T007
         T008 (after T007)
           │
    ┌──────┴──────┐
Phase 5: T009   Phase 6: T011 (parallel)
         T010
    │             │
    └──────┬──────┘
Phase 7: T012 (after Phase 4)
           │
Phase 8: T013
         T014
```

---

## Implementation Strategy

### MVP First (US1+US2+US5 Only — Phases 1-3)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002, T003)
3. Complete Phase 3: US1+US2+US5 (T004, T005, T006)
4. **STOP and VALIDATE**: OSRM ETAs work, fallback works, `etaSource` distinguishes methods
5. Deploy to DEV — ETA accuracy improves from ±30% to ±15% immediately

### Full Delivery (All Phases)

1. MVP (Phases 1-3) → ±15% ETA accuracy
2. Add US3 (Phase 4) → Rush hour correction with defaults → ±10% during peaks
3. Add US4+US6 (Phases 5-6, parallel) → Recency blending + comparison logs
4. Add US7 (Phase 7) → Self-improving factors → ±8% after 1 month
5. Polish (Phase 8) → Quality gates, final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1+US2+US5 are combined because they modify the same function and are inseparable
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- The `data/time-factors.json` file is gitignored — generated by the nightly script, not committed
