# Research: Fix Next Stop Mismatch

## R1: Root Cause of Divergence

**Decision**: The mismatch is caused by two independent "next stop" computations using different time floors.

**Rationale**: `getNextStop` uses `time >= now` while `computeEta` uses `time >= timeFloor` where `timeFloor` comes from `startedAt` (shift start). When `startedAt < now`, `computeEta` can pick a pending stop whose scheduled time has passed, while `getNextStop` skips it.

**Alternatives considered**:
- Auto-advancing past-due stops: Rejected because a missed geofence does not mean the van arrived. Would produce factually incorrect data.
- Removing the UI guard: Rejected because it would show ETA for the wrong stop name.

## R2: Override Location in Code

**Decision**: Override `nextStop` after the progress computation block in both API route handlers.

**Rationale**: The `progress` block is where `nextStopId` becomes available. The override must happen after it but before the JSON response is assembled. Both route handlers follow the same pattern:
1. Compute `nextStop` via `getNextStop` (time-based)
2. Compute `progress` with `computeEta` (status-based)
3. **NEW**: If `isRunning && progress?.nextStopId`, override `nextStop` with the tracking-based stop
4. Build JSON response

**Alternatives considered**:
- Changing `getNextStop` to accept route_run_stop data: Rejected because it would mix concerns and complicate a simple utility function.
- Creating a shared `resolveNextStop` helper: Rejected — only 2 call sites, below the 3-repetition threshold for abstraction (KISS/DRY).

## R3: Subtle Difference Between Route Handlers

**Decision**: Both handlers need the same override logic but have slightly different progress null conditions.

**Rationale**:
- Route list (`route.ts`): Sets `progress = null` when `runStatus === "idle"`
- Route detail (`[routeId]/route.ts`): Sets `progress = null` when `runStatus === "completed"`

The override guard `isRunning && progress?.nextStopId` handles both cases correctly because when `progress` is null, the condition short-circuits. No special handling needed.

## R4: Test Strategy

**Decision**: No new tests required for `computeEta` (already correct). Integration-level verification via the simulation script is sufficient.

**Rationale**: The fix is a data assembly concern in the API route, not a computation logic change. The existing `eta.test.ts` suite covers all `computeEta` edge cases. The change is small and deterministic — if `progress.nextStopId` maps to a valid `sortedEntries` entry, the override fires.
