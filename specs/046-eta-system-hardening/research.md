# Research: ETA System Hardening

**Feature**: 046-eta-system-hardening
**Date**: 2026-03-06

## Research Summary

All NEEDS CLARIFICATION items from the Technical Context have been resolved through codebase exploration and analysis.

---

## R1: Hysteresis State Inference from Recent Pings

**Decision**: Infer grace period from existing `van_location_pings` data — no new DB columns or external cache.

**Rationale**: The API route already queries `van_location_pings` for `recentSpeeds`. By adding `device_ts` to that query, the system can check if any ping within the last 60 seconds had `speed_mps >= 1.0`. This avoids new state management while providing the needed hysteresis behavior.

**Implementation detail**: The `recentSpeeds` query in both `src/app/api/routes/[routeId]/route.ts` (line 177) and `src/app/api/routes/route.ts` (line 169) currently selects only `speed_mps`. Must add `device_ts` to the select and pass timestamps alongside speeds to `computeEta()`.

**Alternatives considered**:
- Redis/in-memory cache for last-moving timestamp — rejected (adds infrastructure dependency for a simple check)
- New DB column `last_moving_at` on `vans` table — rejected (requires migration, tracker update; existing data suffices)

---

## R2: Median Speed Smoothing

**Decision**: Replace arithmetic mean with median in `computeSmoothedSpeed()`.

**Rationale**: Median is immune to single-point GPS spikes. With 10 readings of [5, 6, 5, 40, 6, 5, 4, 6, 5, 6], mean = 8.8 (71% error), median = 5.5 (correct). The training script (`compute-time-factors.ts:131-138`) already uses median for factor aggregation.

**Implementation detail**: Change `eta.ts:37-41`. Sort non-zero values, return middle element (or average of two middle). Existing test in `src/lib/tracking/__tests__/eta.test.ts` has assertion `expect(computeSmoothedSpeed([3, 5, 2, 8])).toBeCloseTo(4.625)` which will change to median = 4.0 (sorted [2,3,5,8], avg of 3 and 5 = 4.0).

**Alternatives considered**:
- EMA (exponential moving average) — rejected per spec assumption: outlier immunity more valuable than recency weighting
- Trimmed mean — rejected: more complex, median achieves same goal

---

## R3: Minimum Segment Gate for timeFactor Blending

**Decision**: Require N >= 3 recent-run segments before blending. With fewer, use only historical factor.

**Rationale**: With N=1, the "recent factor" is a single ratio with no statistical power. For a 15-stop route, N < 3 only during the first 21% of the route — a short window. The current code at `time-factors.ts:132` checks `recentRuns.length > 0`; changing to `>= 3` is a one-line fix.

**Implementation detail**: Change condition in `getTimeFactor()` from `recentRuns.length > 0` to `recentRuns.length >= 3`.

**Alternatives considered**:
- Weighted approach `weight = min(1, N/5)` — rejected: more complex, KISS principle; hard threshold is simpler and adequate
- N >= 5 — rejected: delays blending too long (33% of route)

---

## R4: Pre-computed OSRM Distances for Stop Pairs

**Decision**: Pre-compute OSRM road distances for fixed stop pairs and store as a lookup, used by `buildRecentRuns()` at runtime.

**Rationale**: Stop locations are fixed (defined in `schedule_entries`). The distance between consecutive stop pairs on a route never changes. Pre-computing eliminates the 22% haversine/OSRM discrepancy while adding zero latency to the hot path.

**Storage approach**: Add `osrm_distance_m` nullable float column to `schedule_entries` table. A one-time script computes OSRM distances for all stop pairs and stores the distance from this stop to the next stop in sequence. `buildRecentRuns()` uses `osrm_distance_m` when available, falling back to `haversine * ROAD_FACTOR`.

**Alternatives considered**:
- Separate `stop_pair_distances` table — rejected: extra join, more complex; a column on `schedule_entries` is simpler
- Runtime OSRM calls in `buildRecentRuns()` — rejected: adds latency to API hot path, OSRM could be unavailable
- JSON file cache — rejected: column on existing table is simpler and queryable

---

## R5: Direction Detection in Haversine Fallback

**Decision**: Compute bearing from van's recent trajectory, compare to bearing-to-stop. If angular difference > 90 degrees, fall back to schedule-based ETA.

**Rationale**: `heading_deg` is stored in `van_location_pings` and `vans` tables but never used in ETA. When OSRM is unavailable and the van is moving away from the stop, haversine distance is unreliable. Schedule delay from the last passed stop is a safer estimate.

**Implementation detail**: Add `computeBearing()` to `haversine.ts`. Add `headingDeg` optional field to `VanPosition` interface. In the haversine fallback path of `computeEta()`, if heading data is available, compute bearing to stop and compare. If angular difference > 90 degrees, skip GPS branch and fall through to schedule fallback.

**Alternatives considered**:
- Penalty multiplier on haversine distance — rejected per spec clarification: schedule fallback is safer when heading is wrong
- Compute heading from last 2-3 pings instead of using stored heading — rejected: stored heading is already available and more accurate (from GPS chip)

---

## R6: REFERENCE_SPEED_MPS Unification

**Decision**: Unify to 8.3 m/s. Duplicate the constant in `compute-time-factors.ts` with a synchronization comment.

**Rationale**: `time-factors.ts:62` uses `REFERENCE_SPEED_MPS = 8.3`, `compute-time-factors.ts:33` used 8.33. Both intend ~30 km/h. Since the runtime value (8.3) is already deployed and stable, the script must match it. `compute-time-factors.ts` is a standalone script using `pg` directly — it cannot import from the app's TypeScript paths (`@/lib/...`). The constant is duplicated with value 8.3 and a comment `// ~30 km/h — must match REFERENCE_SPEED_MPS in src/lib/tracking/time-factors.ts`.

**Alternatives considered**:
- Shared constants file importable by both — rejected: standalone script uses different module resolution, would need build step changes
- Change runtime to 8.33 — rejected: 8.3 is already deployed, changing runtime value shifts all in-flight ETAs

---

## R7: Sunday Default Factors

**Decision**: Add baseline Sunday factors with conservative 0.95 range for typical operating hours.

**Rationale**: Current Sunday defaults are empty (`{}`), meaning `getTimeFactor()` returns 1.0 for all hours — no congestion correction at all. Salvador typically has lighter Sunday traffic. A 0.95 baseline for operating hours is conservative and better than no correction.

**Implementation detail**: Add `DEFAULT_SUNDAY_FACTORS` in `time-factors.ts` with values like `{"7": 0.95, "8": 0.95, "9": 0.95, "16": 0.95, "17": 0.95, "18": 0.95}` for the same hours that have weekday corrections.

**Alternatives considered**:
- Use weekday factors scaled by 0.7 — rejected: over-engineering without data
- Leave empty and wait for calibration data — rejected: calibration script has never run; better to have a reasonable baseline

---

## R8: Debug Logging Gate

**Decision**: Gate the verbose `console.log` at `eta.ts:147-159` behind `process.env.DEBUG_ETA` environment variable.

**Rationale**: The log fires on every GPS-based ETA computation — ~900-1,500 times per hour in production. It's the only unconditional hot-path log in the codebase. Gating behind an env var preserves the debugging capability while eliminating production noise.

**Implementation detail**: Wrap the `console.log(JSON.stringify({...}))` block with `if (process.env.DEBUG_ETA) { ... }`.

**Alternatives considered**:
- Remove entirely — rejected: the comparison data is useful for debugging
- Log level system — rejected: over-engineering for a single log statement (YAGNI)

---

## R9: Dead Code Removal (distanceMeters in OSRM branch)

**Decision**: Remove the dead `distanceMeters = osrmResult.distanceMeters` assignment at `eta.ts:110`.

**Rationale**: Since commit `18b6e4b`, the OSRM path uses `osrmResult.durationSeconds / 60` directly (line 134). `distanceMeters` is only used in the haversine fallback (line 113-119). The variable is declared at line 96 with `let distanceMeters: number` — the OSRM branch assigns it but never reads it. Restructure so `distanceMeters` is only assigned in the haversine fallback path.

---

## R10: Calibration Script Documentation

**Decision**: Document how and when to run the calibration script. Do not set up automated cron — manual periodic execution is sufficient for MVP.

**Rationale**: The script (`scripts/compute-time-factors.ts`) exists and is functional but has never been run. `data/time-factors.json` doesn't exist. For a 5-van fleet, monthly manual execution is adequate. Automated cron adds operational complexity (YAGNI).

**Implementation detail**: Add run instructions to `quickstart.md`. Ensure the script works with current DB schema. Document that the output file is git-ignored.

**Alternatives considered**:
- Automated cron job — rejected: operational overhead for 5-van fleet (YAGNI)
- In-app admin trigger — rejected: unnecessary UI for a batch job
