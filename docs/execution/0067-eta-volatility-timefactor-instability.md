# ETA Volatility — `timeFactor` Instability from `recentRuns`

## Problem

Van 03 heading to Fórum Ruy Barbosa shows ETA swinging between 10-30 minutes within seconds. The OSRM duration fix stabilized the base ETA, but the `timeFactor` multiplier remains volatile.

---

## Evidence

From logs within a 17-second window (same stop, same direction):

| Time | OSRM dur | timeFactor | finalETA |
|---|---|---|---|
| 18:16:23 | 478.6s | 1.236x | 9.9m |
| 18:16:32 | 516.8s | 1.127x | 9.7m |
| 18:16:37 | 511.9s | 1.295x | 11.0m |
| 18:16:40 | 506.8s | 1.418x | 12.0m |

OSRM duration is stable (~480-510s). The `timeFactor` swings from 1.13 to 1.42 — a 26% range — causing 2+ minute ETA jumps. At longer distances (earlier in the route), these swings would produce the 11→30→12 minute oscillation the user reported.

---

## Root Cause

`src/app/api/routes/[routeId]/route.ts` lines 211-213:

```ts
const speedMps = vanPosition?.speedMps ?? 0;  // current instantaneous speed
if (speedMps <= 0) continue;
const predictedMinutes = (dist * ROAD_FACTOR) / speedMps / 60;
```

The `recentRuns` array is built by retroactively computing what the "predicted" travel time would have been for each pair of already-passed stops, using the van's current instantaneous speed. Then `computeRecentFactor` computes `actualMinutes / predictedMinutes` to derive a correction ratio, which is blended into `timeFactor` at 30% weight.

Since `predictedMinutes` changes on every API call as `speedMps` fluctuates, the ratio flips:

| Speed | Predicted (1km segment) | Actual (fixed 6 min) | Ratio |
|---|---|---|---|
| 5.1 m/s | 4.2 min | 6 min | 1.43 |
| 7.6 m/s | 2.8 min | 6 min | 2.14 |
| 11.9 m/s | 1.8 min | 6 min | 3.33 |

The median of these ratios shifts wildly depending on the van's momentary speed, making `timeFactor` a noisy function of instantaneous GPS speed — the exact volatility source the OSRM duration fix was supposed to eliminate.

---

## Fix Needed

Replace instantaneous speed with a fixed reference baseline when computing `predictedMinutes` for passed stop pairs.

**Options:**

1. **OSRM duration between each stop pair** — most accurate, but adds N OSRM calls per request
2. **Fixed reference speed** (e.g. `8.3 m/s` / 30 km/h) — simple, zero overhead, makes the ratio purely reflect traffic conditions
3. **Smoothed speed** (already computed from last 10 pings) — better than instantaneous but still shifts between requests

**Option 2 is the simplest and most stable.** The exact reference speed value doesn't matter much because it cancels out — what matters is that it's constant across API calls so the `actual / predicted` ratio only changes when a new stop is actually passed.
