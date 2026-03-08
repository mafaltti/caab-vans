# Correction Factor — Haversine vs OSRM in Training

> Explain better about "#: 4".

● The nightly script computes correction factors by comparing actual vs predicted travel times between stops. The "predicted" time needs a distance estimate.

**CodeRabbit suggests:** use OSRM road distance in the script (same as production) instead of haversine × 1.3.

**Why I skipped it:** The script runs offline (cron job, possibly on a different machine). OSRM may not be reachable during batch processing — and calling OSRM for every stop pair across 30 days of data would be slow and add a runtime dependency to what should be a simple DB-to-JSON pipeline.

## The Self-Calibrating Argument

But there's a deeper reason it doesn't matter: the correction factor is `actual_time / predicted_time`. If haversine × 1.3 consistently underestimates distance by, say, 10% compared to OSRM, then the computed factor will be ~10% higher to compensate. When this factor is later applied at runtime (where OSRM is used), the system self-corrects — the factor absorbs the distance estimation error.

In other words: using a less accurate distance in training just shifts the correction factor proportionally. The final ETA (`distance × factor / speed`) converges to the same result because the factor compensates for the distance method used to compute it.

The only scenario where this breaks is if the haversine-to-road-distance ratio varies wildly between stop pairs (e.g., one pair has a direct road, another has a huge detour). But with the median aggregation and 20-observation minimum per bucket, these differences get smoothed out.

**TL;DR:** The correction factor is self-calibrating. Using haversine in training and OSRM at runtime produces the same final ETA accuracy as using OSRM in both, because the factor absorbs the difference.

---

## The Flaw in That Argument

● Thinking about it more carefully, the "self-calibrating" argument has a flaw.

The factor is computed across **all stop pairs** in a `(dayType, hour)` bucket, then applied to a **specific stop pair** at runtime. If the haversine-to-road ratio varies between pairs, the aggregated factor carries noise from road geometry that doesn't apply to the runtime pair.

### Example

Two stop pairs, both at 8AM weekday, same actual travel time (10 min):

| Pair             | Haversine × 1.3 | OSRM  | Speed  | Factor (haversine) | Factor (OSRM) |
|------------------|-----------------|-------|--------|--------------------|---------------|
| A (direct road)  | 1000m           | 1100m | 10 m/s | 6.0                | 5.45          |
| B (big detour)   | 1000m           | 2000m | 10 m/s | 6.0                | 3.0           |

With haversine training, both pairs produce factor `6.0` — identical, because haversine doesn't see the detour. The median is `6.0`.

At runtime, applying `6.0` to pair B's OSRM distance (`2000m`) **overestimates** the ETA. With OSRM-trained factors, pair B would get factor `3.0` — correctly reflecting that the road is longer but congestion isn't worse.

## Impact for CAAB Specifically

The impact is probably small because:

1. **Fixed routes** — the same stop pairs recur daily, so per-pair noise is at least consistent
2. **3–5 vans in one city** — limited road geometry diversity
3. **Median aggregation + 20-observation minimum** smooths outliers
4. **Recency blending** (30% from today's actual runs) further corrects at runtime

It would be a cleaner, more correct design — but probably marginal improvement in practice for this scale. If the system grows to more routes with diverse geometries, it would matter more.

---

Up to you — want me to add OSRM to the script? It'd mean the script needs `OSRM_BASE_URL` as an additional dependency, and would be slower (one OSRM call per stop pair).
