# Full Analysis: False "Atrasado" Bug

## Root Cause

The segment fallback in `eta.ts` (lines 279–288) computes ETA purely from distance and speed, with no awareness of the scheduled stop time:

```
etaDateTime = lastPassedStop.passedAt + (osrmDistance / REFERENCE_SPEED) × timeFactor
```

It then checks `if (etaDateTime <= now) → return "overdue"`. This produces false positives when the van is early and waiting.

## All 3 ETA Paths

| Path | Source | Lines | Overdue Logic | Bug? |
|------|--------|-------|---------------|------|
| GPS | Real-time location | 136–243 | Always returns `"estimated"` | Safe |
| Segment | OSRM distance cache | 246–304 | `computedEta <= now` | **FALSE POSITIVE** |
| Schedule | Schedule + delay propagation | 309–356 | `scheduledTime + delay <= now` | Safe (schedule-aware) |

## Why Segment Fails, Schedule Doesn't

- **Segment:** `ETA = passedAt + travelTime` — backward-looking, no schedule awareness
- **Schedule:** `ETA = scheduledTime + delay` — anchored to the schedule, so negative delay (early) keeps ETA in the future

## Edge Case Matrix

| Scenario | Segment Result | Schedule Result | Correct? |
|----------|----------------|-----------------|----------|
| Van early, stopped | `"overdue"` (ETA in past) | `"estimated"` (ETA in future) | Segment wrong |
| Van on-time, stopped | `"overdue"` (ETA in past) | `"estimated"` | Segment wrong |
| Van late, stopped | `"overdue"` | `"overdue"` | Both correct |
| Van moving (any delay) | N/A (GPS path used) | N/A | GPS always correct |

## Frontend: No Safety Net

All 4 components (`route-card.tsx`, `route-detail-peek.tsx`, `schedule-timeline.tsx`, `hero-card.tsx`) blindly trust `etaStatus === "overdue"`. They all have access to the scheduled stop time but don't use it as a guard. No client-side validation exists.

## The Fix

In the segment fallback overdue check (line 279), gate by whether the scheduled time has actually passed:

```ts
// Current (buggy):
if (etaDateTime <= now) → "overdue"

// Fixed:
const nextStopScheduled = parseTime(nextStop.time);
if (etaDateTime <= now && nextStopScheduled <= now) → "overdue"
```

### Why this works

- Van early at 17:17, next stop 17:40: `17:15 <= 17:17` BUT `17:40 > 17:17` → **not overdue** ✓
- Van late at 17:50, next stop 17:40: `17:20 <= 17:50` AND `17:40 <= 17:50` → **overdue** ✓

> Same fix should be applied to the schedule fallback (line 333) for robustness, though it's less likely to false-positive there.

## Severity

**Medium-high** — this triggers every time a van is ahead of schedule and stops (which happens regularly at stops). It causes incorrect "Atrasado" display to passengers even when service is running early.
