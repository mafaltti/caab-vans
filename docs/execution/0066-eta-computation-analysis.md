# ETA Computation — Full Analysis

Three distinct problems found.

---

## Problem 1: Speed=0 Drops GPS-Based ETA Entirely

Line 81: `vanPosition.speedMps >= MIN_SPEED_MPS (1.0 m/s)`

When the van stops (traffic light, loading passengers), speed drops to 0 and the entire GPS branch is skipped. ETA falls back to schedule-based, which ignores how close the van actually is to the stop. Van 02 was 860m from Mundo Plaza showing 8 minutes ETA instead of ~2 minutes.

---

## Problem 2: OSRM `durationSeconds` Is Fetched but Never Used

This is the biggest issue in the ETA formula. At line 100, only `distanceMeters` is extracted from the OSRM result:

```ts
distanceMeters = osrmResult.distanceMeters;  // uses distance
// osrmResult.durationSeconds is available but IGNORED
```

Then at line 112, ETA is computed as:

```ts
baseTravelMinutes = distanceMeters / vanPosition.speedMps / 60
```

This divides OSRM road distance by the van's instantaneous GPS speed. This is wrong for two reasons:

- **OSRM already computes duration** based on road speed limits and turn penalties. Its `durationSeconds` (e.g. 191.8s = 3.2 min) is a stable, road-aware baseline — far better than dividing road distance by a fluctuating instantaneous speed.
- **Instantaneous speed is volatile** — at 1.19 m/s (crawling in traffic), `2310m / 1.19 = 32 minutes`. At 7.82 m/s (briefly accelerating), `2310m / 7.82 = 5 minutes`. The ETA swings wildly between pings.

From the logs, the same ~2.3km road distance produced ETAs ranging from 4.4 to 12.8 minutes purely based on speed fluctuation — while OSRM consistently said ~3.2 minutes.

**The fix:** use `osrmResult.durationSeconds / 60` as the base ETA instead of `distanceMeters / speedMps / 60`. Then still apply `timeFactor` on top — OSRM uses static OSM speed limits, not real-time traffic, so the time factor remains valuable for congestion adjustment.

---

## Problem 3: OSRM Routing Anomaly on Divided Roads

On Av. ACM (a divided highway in Salvador), OSRM returns vastly different distances depending on direction:

| Direction | Haversine | OSRM distance | OSRM duration |
|---|---|---|---|
| Van → Mundo Plaza (with traffic flow) | 858m | 2,310m | 191.8s |
| From opposite direction | 858m | 845m | 78.4s |
| Against traffic flow | 420m | 4,329m | 287.4s |

The van is on a one-way divided avenue. OSRM correctly routes via the road network (U-turn at next junction), but the resulting 2.3km distance, when divided by the van's instantaneous speed, gives a wildly inflated ETA. If OSRM's own duration (191.8s ≈ 3.2 min) were used instead, the result would be reasonable even on divided roads.

Worse, in the logs at 13:38:31, OSRM distance jumped from 1,202m to 2,817m as the van passed a junction — OSRM's road route shifted to a longer path, but its duration only went from 110s to 279s. The current formula amplifies distance jumps through the speed divisor, while using OSRM duration directly would show a smooth, predictable progression.

---

## Evidence from Logs

| Haversine | OSRM | Ratio | OSRM dur | Speed | ETA |
|---|---|---|---|---|---|
| 824m | 1307m | 1.6x | 120.7s | 1.2 | 12.8m |
| 772m | 1264m | 1.6x | 116.1s | 1.4 | 10.8m |
| 702m | 1202m | 1.7x | 110.6s | 2.0 | 6.9m |
| 334m | 2817m | 8.4x | 279.2s | 5.3 | 6.2m ← OSRM distance jumps 2x |
| 276m | 2771m | 10.0x | 275.1s | 7.1 | 4.6m |
| 230m | 2965m | 12.9x | 291.5s | 7.8 | 4.4m |
| 202m | 2937m | 14.5x | 289.0s | 7.2 | 4.8m |

If OSRM duration were used with `timeFactor` 0.7: `120.7s × 0.7 = 1.4 min` → progressively down to `289s × 0.7 = 3.4 min`. Stable and realistic.

---

## Summary of Fixes Needed

| # | Problem | Fix |
|---|---|---|
| 1 | Speed=0 abandons GPS ETA | Allow GPS branch when close to stop (<500m), use fallback speed |
| 2 | OSRM duration ignored | Use `osrmResult.durationSeconds / 60` as the base ETA when OSRM is available, instead of `distance / instantaneousSpeed`. Still apply `timeFactor` — OSRM uses static OSM speed limits, not real-time traffic |
| 3 | Speed volatility (non-OSRM fallback) | When OSRM is unavailable and using the `haversine × ROAD_FACTOR` path, use a smoothed speed (average of last N pings) instead of instantaneous GPS speed |
