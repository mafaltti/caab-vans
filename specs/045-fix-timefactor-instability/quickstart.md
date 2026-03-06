# Quickstart: Fix timeFactor Instability

## Files to Change

1. **`src/lib/tracking/time-factors.ts`** — Add `REFERENCE_SPEED_MPS`, `MIN_SEGMENT_DIST_M`, `MIN_SEGMENT_TIME_MIN` constants and `buildRecentRuns()` helper function.
2. **`src/app/api/routes/[routeId]/route.ts`** — Replace inline `recentRuns` loop (lines 204-217) with `buildRecentRuns()` call.
3. **`src/app/api/routes/route.ts`** — Replace inline `recentRuns` loop (lines 196-209) with `buildRecentRuns()` call.

## Local Development

```bash
# Run dev server
npm run dev

# Type-check
npx tsc --noEmit

# Lint
npx eslint .

# Build
npm run build

# Tests
npx vitest
```

## How to Verify

1. Start a route run with the tracker app on a van.
2. Watch the `eta_comparison` log events in the server console.
3. Observe that `timeFactor` remains stable across consecutive API calls when no new stops are passed.
4. Confirm that `timeFactor` adjusts when a new stop is actually passed.

## Key Insight

The fix is mathematically neutral — the reference speed value cancels out in the `actual / predicted` ratio. The only thing that matters is that the denominator (`predictedMinutes`) is **constant across API calls** for the same set of passed stops.
