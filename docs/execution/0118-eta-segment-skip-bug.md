# ETA Segment Distance Bug After Stop Skip

## Root Cause

The segment-based ETA uses the wrong OSRM distance when stop 14 was skipped.

### Current State at 10:31 Bahia Time

| Fact | Value |
|---|---|
| Last GPS ping | 10:24 (7 min ago — stale, threshold is 3 min) |
| GPS branch | skipped (stale data) |
| Last passed stop | #13 CAAB (10:20), passed at 10:23 |
| Stop #14 | Fórum Ruy Barbosa — skipped |
| Next stop (pointer) | #15 Mundo Plaza (10:55) — pending |

Since GPS is stale, the segment branch is used. It sums OSRM distances between the last passed stop and the target.

But because stop #14 is filtered out (skipped), the segment array goes directly from `#13 → #15`, and it reads the OSRM distance stored on stop `#13`:

- OSRM on stop #13 (CAAB): `1141.1m` — this is the distance to its original next neighbor (#14 Fórum Ruy Barbosa), **not** to #15 Mundo Plaza
- Actual distance CAAB → Mundo Plaza: ~5–6 km

So the segment ETA computes:

```
1141.1m / 8.3 m/s / 60 × timeFactor ≈ 2.5 minutes
ETA = 10:23 (passedAt) + 2.5 min = 10:25:30
Now = 10:31 → ETA is 5 minutes in the past
```

Then the overdue guard kicks in — but **fails to trigger**:

```
if (etaDateTime <= now && scheduledTime <= now)
  // etaDateTime (10:25) ≤ now (10:31) ✓
  // scheduledTime (10:55) ≤ now (10:31) ✗
```

Since the scheduled time (10:55) hasn't passed yet, the overdue branch is skipped, and the result becomes:

```
Math.max(0, Math.ceil(10:25 - 10:31)) = Math.max(0, -5) = 0
```

## Two Bugs

### 1. Segment Distance Wrong After Skips

When a stop is skipped and filtered out, the OSRM distance on the preceding stop still points to the skipped neighbor, not the actual next pending stop. The accumulated distance is `1.1 km` instead of `~6 km`.

### 2. 0 min Instead of Overdue/Recalc

When the segment ETA falls in the past but the scheduled time is still in the future, it clamps to `0` instead of falling through to the schedule branch or marking overdue.
