# Quickstart: Fix Cold-Start Confirmed Stop

## Overview

Fix the confirm-start-stop endpoint to include the confirmed stop in the set of stops marked as `passed` during a cold-start confirmation. Change a single filter operator (`<` → `<=`) and update the idempotency guard.

## Files to Modify

1. **`src/app/api/routes/[routeId]/confirm-start-stop/route.ts`**
   - Line 163: Change `seq < confirmedStopSequence` → `seq <= confirmedStopSequence`
   - Lines 108-129: Update idempotency check — detect retry by target stop's passed status instead of `run.next_stop_id === stopId`

2. **`src/__tests__/lib/tracking/confirm-start-stop.test.ts`**
   - Update happy-path test expectations (confirmed stop now passed, nextStopId shifted)
   - Update idempotency test expectations
   - Add edge case: confirm last stop → all passed, next_stop_id null
   - Add edge case: confirm first stop → only it passed, next_stop_id is stop #2

## How to Test

```bash
# Run affected tests
npx vitest run src/__tests__/lib/tracking/confirm-start-stop.test.ts

# Quality gates
npx eslint .
npx tsc --noEmit
npx next build
npx vitest run
```

## Manual Verification (DEV)

1. Start a shift at least 30 minutes late (triggers cold-start detection)
2. Confirm a mid-route stop
3. Verify the commuter-facing app shows the stop **after** the confirmed one as "next stop"
4. Drive to the next stop and verify geofence events advance it normally
