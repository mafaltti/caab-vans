# Quickstart: Gate Stop-Progress Inference by Active Shift

## What This Feature Does

Adds a shift-existence check to `inferStopProgress()` so that stops are only seeded and marked as "passed" when a driver has an active shift. Without this gate, GPS pings from parked or idle vans can incorrectly mark stops.

## Single File Change

**File**: `src/lib/tracking/infer-stop-progress.ts`

**Location**: After the `route_runs` upsert (line 62), before stop seeding (line 64).

**Logic**:
```
1. Query route_shifts for run_id with ended_at IS NULL, limit 1
2. If no active shift found → return EMPTY_PROGRESS immediately
3. Otherwise → continue with existing behavior (seed, geofence, mark, backfill)
```

## Test Changes

**File**: `src/__tests__/tracking/infer-stop-progress.test.ts`

**What to add**:
- Extend `createMockSupabase()` to support `route_shifts` table queries
- Add 3 test cases: no shift → empty, active shift → normal behavior, ended shift → empty

## How to Verify

```bash
# Run existing + new tests
npm test -- --run src/__tests__/tracking/infer-stop-progress.test.ts

# Type check
npx tsc --noEmit

# Lint
npx eslint src/lib/tracking/infer-stop-progress.ts
```

## Key Constraints

- Do NOT gate the `route_run` upsert — it must still auto-create (needed as container for shifts)
- Do NOT change any other files — call sites ignore the return value
- Do NOT add schema migrations — `route_shifts` table already exists
- Preserve ALL existing stop-marking behavior when a shift IS active
