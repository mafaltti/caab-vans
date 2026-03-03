# Quickstart: Fix Stop Progress Backfill

## What This Changes

Single file modification: `src/lib/tracking/infer-stop-progress.ts`

The `inferStopProgress` function currently:
1. Iterates pending stops in time order
2. Marks only the first geofence-matched occurrence per coordinate
3. Does NOT backfill earlier stops

After this fix:
1. Groups pending stops by coordinate, picks the closest-in-time match
2. After geofence matches, backfills all earlier pending stops in one query

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/tracking/infer-stop-progress.ts` | Rewrite step 6 (geofence loop) + add backfill step |
| `src/__tests__/tracking/infer-stop-progress.test.ts` | Add tests for backfill + closest-in-time; extend mock |

## Algorithm Change (Step 6 Rewrite)

### Current: First-match dedup
```
for each pending stop (time ASC):
  if coordKey already matched → skip
  if too early → skip
  if within geofence → mark passed, add to matchedCoords
```

### New: Closest-in-time + backfill
```
1. Group pending stops by coordKey
2. For each group:
   a. Filter by early arrival window
   b. Check geofence (only need one check per coordinate)
   c. If match: pick the stop with min |time - now| → mark passed
3. After all matches:
   a. Find max time among all newly passed stops
   b. Collect IDs of pending stops with time < maxPassedTime
   c. Batch update via .in("schedule_entry_id", ids) → mark all as passed
```

## Key Constraints

- No schema changes, no new migration
- No API contract changes (StopProgress return type unchanged)
- Single production caller: `POST /api/tracking/[vanId]`
- Early arrival window (30 min) preserved
- Tests must cover: backfill, closest-in-time, repeated stops, edge cases

## Dev Commands

```bash
# Run tests
npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts

# Type check
npx tsc --noEmit

# Lint
npx eslint src/lib/tracking/infer-stop-progress.ts
```
