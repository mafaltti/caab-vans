# Implementation Complete

## What Changed (3 source files + 1 test file)

### `src/lib/tracking/time-factors.ts` — Added:

- `REFERENCE_SPEED_MPS` (8.3), `MIN_SEGMENT_DIST_M` (100), `MIN_SEGMENT_TIME_MIN` (0.5) constants
- `PassedStop` interface
- `buildRecentRuns()` helper that uses fixed reference speed instead of volatile GPS speed, with segment filtering

### `src/app/api/routes/[routeId]/route.ts`

Replaced 14-line inline `recentRuns` loop with single `buildRecentRuns(passedStops, ROAD_FACTOR)` call. Removed unused `haversineDistanceMeters` import.

### `src/app/api/routes/route.ts`

Same replacement. Removed unused `haversineDistanceMeters` import.

### `src/__tests__/tracking/time-factors.test.ts` (new) — 10 tests covering:

- `buildRecentRuns`: empty/single stop, stable output, distance filtering, time filtering, idempotency, null coords
- `computeRecentFactor`: congestion (>1.0), free flow (<1.0), median smoothing

---

## Quality Gates

- **Type-check:** PASS
- **Lint:** PASS (0 errors)
- **Build:** PASS
- **Tests:** 93/93 PASS

---

## Why It Works

The `predictedMinutes` denominator is now computed with a constant `REFERENCE_SPEED_MPS` instead of `vanPosition.speedMps`. Since the reference speed cancels out in the `actual / predicted` ratio, the `timeFactor` only changes when a new stop is actually passed — eliminating the volatility from fluctuating GPS readings.
