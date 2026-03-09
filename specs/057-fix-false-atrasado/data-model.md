# Data Model: Fix False "Atrasado" (Overdue) Status

**Branch**: `057-fix-false-atrasado` | **Date**: 2026-03-09

## No Schema Changes

This bug fix modifies computation logic only. No database tables, columns, or relationships are added, removed, or altered.

## Existing Entities (Reference)

### EtaResult (computed, in-memory)

| Field | Type | Description |
|-------|------|-------------|
| etaNextStopISO | string \| null | Computed ETA as ISO timestamp |
| etaNextStopMinutes | number \| null | Minutes until next stop (null when overdue) |
| delayMinutes | number \| null | Current delay in minutes |
| nextStopId | string \| null | Schedule entry ID of next stop |
| passedStopIds | string[] | IDs of all passed stops |
| etaSource | "gps" \| "gps_osrm" \| "segment" \| "schedule" \| null | Which computation path produced the ETA |
| etaStatus | "estimated" \| "overdue" \| "none" | **Status affected by this fix** |

### Stop (input to ETA computation)

| Field | Type | Relevant to fix |
|-------|------|----------------|
| time | string (HH:mm) | **Yes** — used as schedule guard via `now.set({ hour, minute })` |
| status | "passed" \| "pending" | Used to identify next stop |
| passedAt | string (ISO) \| null | Used to compute segment travel time |
| osrmDistanceM | number \| null | Used in segment distance accumulation |

## State Transition (etaStatus)

No change to valid states. The fix narrows the conditions under which the `"overdue"` state is entered:

- **Before**: `etaDateTime <= now` → `"overdue"`
- **After**: `etaDateTime <= now AND scheduledTime <= now` → `"overdue"` (where `scheduledTime = now.set({ hour, minute })` from `nextStop.time`)

Additionally, both fallback estimated paths now clamp minutes: `Math.max(0, Math.ceil(...))` to prevent negative `etaNextStopMinutes` when the guard allows the estimated path with a past ETA.
