# Research: Fix ETA Idle Suppression

## Decision: Remove idle suppression from both API endpoints

**Rationale**: The `if (runStatus === "idle") { progress = null; }` condition in both route API endpoints suppresses ETA and progress data on the public page when a driver ends their shift. This is incorrect because:

1. Public users need ETA regardless of shift status — they care about van arrival, not driver shifts.
2. `computeEta` already handles `startedAt: undefined` correctly by falling back to `now` as `timeFloor`.
3. All consuming components use safe optional chaining (`progress?.runStatus`, `progress?.etaNextStopMinutes`).
4. Status badges (`route-status-badge.tsx`, `hero-card.tsx`) already have explicit `idle` handling that only works when progress is NOT null.

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|-----------------|
| Add a separate `publicProgress` field | Over-engineering. The existing progress structure works. |
| Suppress ETA but keep runStatus | Creates inconsistent state — runStatus without ETA data is confusing. |
| Change only the list endpoint | Detail endpoint has the same bug (lines 161-162). Both must be fixed. |

## Findings

### 1. Routes list endpoint (`src/app/api/routes/route.ts`)

Lines 155-156 set `progress = null` when idle. Removing this lets the else block (lines 157-198) execute, which fetches `route_run_stops` and calls `computeEta`. The `activeShift` is null during idle, so `startedAt` is undefined — handled by the `timeFloor` fallback.

### 2. Route detail endpoint (`src/app/api/routes/[routeId]/route.ts`)

Lines 161-162 have the identical suppression pattern. Must be fixed together with the list endpoint.

### 3. `computeEta` null startedAt handling (`src/lib/tracking/eta.ts`)

Lines 45-49: `timeFloor = startedAt ? DateTime.fromISO(startedAt)... : now.toFormat("HH:mm")`. When `startedAt` is undefined, falls back to current time — correct behavior.

### 4. Component safety

All consumers use optional chaining. Additionally, `route-status-badge.tsx` and `hero-card.tsx` have explicit `idle` case handling that currently never triggers (because progress is null). After the fix, these idle-specific UI states will correctly render.

### 5. "Completed" suppression

`deriveRunStatus` returns `"completed"` only when past schedule window AND all shifts ended. Per the spec, this is the only status that should suppress ETA. The current code does NOT suppress on "completed" — it only suppresses on "idle". After the fix, we should add suppression for "completed" instead.
