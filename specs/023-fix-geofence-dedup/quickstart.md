# Quickstart: Fix Geofence Duplicate Stop Passing

**Feature**: `023-fix-geofence-dedup`

## What This Feature Changes

Fixes a bug where `inferStopProgress()` marks ALL pending occurrences of a repeated stop location as "passed" when the van enters its geofence. After the fix, only the first pending occurrence (by schedule time) is marked, with a 30-minute early-arrival window guard.

## Files to Change

1. **`src/lib/tracking/infer-stop-progress.ts`** — Main fix: modify geofence loop to deduplicate by coordinate and add time window guard
2. **`src/lib/time.ts`** — Add `EARLY_ARRIVAL_WINDOW_MINUTES = 30` constant
3. **`src/__tests__/tracking/infer-stop-progress.test.ts`** — Add unit tests for the new behavior

## Implementation Steps

### Step 1: Add constant to `src/lib/time.ts`

Add `EARLY_ARRIVAL_WINDOW_MINUTES = 30` alongside the existing `STALENESS_THRESHOLD_MINUTES`.

### Step 2: Modify geofence loop in `inferStopProgress`

In the geofence checking section (step 6), change the loop to:
- Track matched coordinates in a `Set<string>` (key: `${lat},${lng}`)
- Before marking a stop, check: (a) coordinate not already matched, (b) current time is within 30 minutes before the stop's scheduled time
- After marking, add the coordinate key to the Set

### Step 3: Add tests

Test cases:
- Single-occurrence stop still works (regression)
- Repeated stop: only first pending is marked
- Time window: stop >30min in future is skipped
- Sequential visits: second arrival marks second occurrence

## How to Test Manually

```bash
# 1. Start dev server
npm run dev

# 2. Run simulate tracking (sends pings for all vans)
npm run tracking:simulate

# 3. Check API response — verify etaSource and stop counts
curl http://localhost:3000/api/routes | python3 -m json.tool

# 4. Check route_run_stops in database for correct passed/pending status
```

## Quality Gates

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run build       # next build
```
