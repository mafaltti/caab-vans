# ETA System — Deep Analysis of 11 Issues

---

## #1 — Dead Variable `distanceMeters` in OSRM Branch

**Status: Confirmed dead code**

At `eta.ts:110`, `distanceMeters = osrmResult.distanceMeters` is assigned, but the OSRM branch at line 134 uses `osrmResult.durationSeconds / 60` directly for `baseTravelMinutes`. The `distanceMeters` variable is only consumed at line 136 — inside the `else` clause that never executes when `osrmResult` is truthy.

The logging block (line 152) accesses `osrmResult.distanceMeters` directly, not the local variable.

**Impact:** Zero runtime effect. Leftover from pre-fix code when OSRM distance was divided by speed.
**Fix:** Remove line 110. Trivial.

---

## #3 — GPS→Schedule Transitions

**Root cause:** Binary cliff at `eta.ts:93`:

```ts
gpsConditionsMet = hasCoords && locationFresh && (isMoving || isNearStop)
```

Speed dropping from 1.1 → 0.9 m/s at >500m flips the entire ETA method instantly.

**Realistic jump magnitudes:**

| Transition | Trigger | Example | Frequency |
|---|---|---|---|
| GPS_OSRM → Schedule | Red light, >500m away | 8 min → 5 min (−37%) | Every 2-3 min |
| GPS_haversine → Schedule | Passenger boarding, far stop | 9.5 min → 5 min (−47%) | Every 5-10 min |
| Schedule → GPS (proximity) | Van near stop, speed=0 | 3 min → 1.5 min (−50%) | At each stop |
| GPS_OSRM → GPS_haversine | OSRM timeout/crash | 8 min → 13 min (+62%) | Rare |

Estimated: 20-40 ETA jumps per hour during normal urban operation (traffic lights + boarding stops). `etaSource` is computed but never displayed — users see unexplained number changes.

**Hysteresis solution:** Keep GPS ETA active for ~60 seconds after speed drops (using `FALLBACK_SPEED_MPS`). Covers typical traffic light duration (30-60s) without stale data risk. Would need to track `lastEtaSource + lastGpsEtaTime` — currently not persisted between API calls.

**Test gap:** No test covers a GPS→Schedule→GPS sequence or validates jump magnitude limits.

---

## #5 — `buildRecentRuns` (Haversine) vs Training Script (OSRM)

**The mismatch:**

- Runtime `buildRecentRuns()` (`time-factors.ts:86`): `haversineDistanceMeters(...) × ROAD_FACTOR`
- Training script (`compute-time-factors.ts:90`): `osrmDistance(...)` with `haversine × 1.3` fallback

**Numeric example (typical Salvador stop pair):**

| Method | Distance | Predicted | Actual | Ratio |
|---|---|---|---|---|
| `buildRecentRuns` (haversine × 1.3) | 650m | 1.31 min | 2 min | 1.53 |
| Training script (OSRM) | 800m | 1.60 min | 2 min | 1.25 |

22.6% discrepancy in the computed ratio. Since recent factor gets 30% weight in the blend, this translates to ~6.8% systematic overestimation in final `timeFactor`. On a 10-min ETA, that's ~41 seconds of unnecessary buffer.

For routes with divided roads (Av. ACM), the mismatch can reach 50% (haversine ≈ 0.67 × OSRM).

---

## #6 — 70/30 Blend with 1-2 Samples

**Code:** `time-factors.ts:134`: `return 0.7 * historical + 0.3 * recent`

The blend applies at any N ≥ 1, with no minimum threshold.

With N=1 (first stop passed, single segment):
- One 4.5-minute segment with ratio 1.5
- `computeRecentFactor` returns 1.5 (median of one value = that value)
- `timeFactor = 0.7 × 1.4 + 0.3 × 1.5 = 1.43`
- If this was an atypical segment (e.g., long boarding), the whole ETA is skewed

For a 15-stop route, N < 3 for the first 21% of the route (first 3 stops). During morning rush (7-9 AM), users checking early will see factors based on 1-2 data points.

**Two proposed fixes:**

| Approach | Logic | N=1 | N=3 | N=5+ |
|---|---|---|---|---|
| Gate N≥3 | Use historical-only until 3 segments | 100% historical | Start blending | Normal |
| Weighted: `min(1, N/5)` | Gradual blend-in | 20% recent | 60% recent | 100% recent |

The weighted approach is smoother but adds complexity. Gate N≥3 is simpler and covers the high-risk early period.

---

## #7 — No Direction Detection

**Key finding:** `heading` IS stored but NEVER used for ETA.

- `van_location_pings.heading_deg` — exists in schema (`00002_live_tracking.sql`)
- `trackingSchema` validates heading: `z.number().min(0).max(360).nullable()`
- Tracking endpoint stores it in both `van_location_pings` and `vans.last_heading_deg`
- Zero references to `heading` in `eta.ts`

When OSRM is available, direction is implicitly handled — OSRM routes through the actual road network, so a van on the wrong side gets a longer (correct) duration.

When OSRM fails (haversine fallback), a van 1km away moving away at 8 m/s:
- Current ETA: `1000 × 1.3 / 8 / 60 = 2.7 min`
- Actual (needs to turn around): ~4.2+ min
- Error: 55%+

For CAAB's fixed routes with OSRM available, this is low-priority. It only matters in the haversine fallback path, which should be rare if OSRM is reliable.

---

## #9 — Simple Mean for Speed Smoothing

**Current:** `computeSmoothedSpeed()` = arithmetic mean of non-zero speeds from last 10 pings.

**Comparison with realistic data:**

| Scenario | Mean | Median | EMA (α=0.3) | Winner |
|---|---|---|---|---|
| Normal `[5,6,5,7,6,5,4,6,5,6]` | 5.5 | 5.5 | 5.6 | Any |
| GPS spike `[5,6,5,40,6,5,4,6,5,6]` | 9.4 (+71%) | 5.5 | ~8-9 | Median |
| Accelerating `[2,3,4,5,6,7,8,9,10,11]` | 6.5 | 6.5 | 8.87 | EMA |
| Traffic stop (zeros filtered) | 3.83 | 4.0 | 3.9 | All similar |

The GPS spike case is the problem. A single 40 m/s outlier (GPS noise) makes the mean jump 71%. Median is immune. EMA is partially immune but carries the spike for several pings.

**Recommendation:** Switch to median. It matches mean on normal data, is immune to outliers, and is trivial to implement (sort + pick middle). EMA is better for acceleration detection but worse for spikes.

---

## #10 — Schedule Fallback: Last-Stop Delay Only

**Current:** `eta.ts:201-203` — uses only the most recent passed stop's delay.

**With worsening delays (+2, +5, +8):**

| Method | Predicted delay for next stop | Notes |
|---|---|---|
| Current (last-stop) | +8 | Reactive but no trend |
| Average | +5 | Smooth but slow to react |
| Weighted average | +6.3 | Balanced |
| Linear regression | +11 | Captures trend but over-extrapolates |
| Median (last 3) | +5 | Robust to outliers |

**With recovering delays (+2, +5, +2):**
- Current: +2 (correct — reflects recovery)
- Average: +3 (lags behind)
- Weighted: +2.6 (close to current)

The current approach is actually good for recovery scenarios and acceptable for worsening scenarios. Trend detection (linear regression) risks wild extrapolation. Weighted average is the best general-purpose improvement but adds complexity.

**Test gap:** No test verifies behavior with 3+ passed stops or delay trends.

**Schedule fallback usage:** ~15-20% of active shift time (mostly traffic light stops and first minutes of route).

---

## #13 — `console.log` on Every ETA Computation

**Location:** `eta.ts:147-159` — fires on every GPS-based ETA call.

**Production volume:** ~900-1,500 logs/hour (3-5 vans × 2-5 pings/min × ~300 bytes each).

**Context:** This is the only unconditional hot-path log in the codebase. All other logging (`console.warn`, `console.error`) is for exceptional conditions only. No `LOG_LEVEL` or conditional logging infrastructure exists.

**Fix options:**

1. Remove entirely (data already served its debugging purpose)
2. Gate behind `process.env.ETA_DEBUG` flag
3. Sample (log 1 in 10 calls)

---

## #14 — `REFERENCE_SPEED_MPS` Mismatch

- Runtime: `time-factors.ts:62` → `8.3 m/s`
- Script: `compute-time-factors.ts:33` → `8.33 m/s`

**Practical impact:** 0.36% difference → 0.12% in final `timeFactor` (through 30% blend). Negligible for ETA accuracy.

However, it signals a conceptual inconsistency — both intend "~30 km/h" but round differently. Should be unified to one exported constant.

---

## #15 — `FALLBACK_SPEED_MPS = 4.2` Undocumented

`4.2 m/s = 15.12 km/h` — used when GPS speed < 1.0 m/s but GPS branch is still active (proximity fallback).

**Sensitivity for a 500m segment:**

| Speed | ETA |
|---|---|
| 3.0 m/s | 3.6 min |
| 4.2 m/s | 2.6 min |
| 6.0 m/s | 1.8 min |

The value is reasonable for urban crawling speed but completely undocumented. No commit, PR, or doc explains its origin. Compare to `REFERENCE_SPEED_MPS` which has a 5-line explanation comment.

---

## #16 — Hardcoded Default Factors Unvalidated

**Values:** Peak rush 1.35-1.4x (7-8 AM, 5-6 PM weekday). Saturday has minimal corrections. Sunday is empty (1.0x = no congestion assumed).

**Origin:** Spec says "seeded with reasonable city defaults" — these are educated guesses, not derived from CAAB data.

The nightly script has never been run. `data/time-factors.json` doesn't exist. The system runs entirely on hardcoded defaults.

**Impact of being wrong:** A ±0.2 error in `timeFactor` → ±20% ETA error. On a 12-minute segment at 8 AM, that's ±2.4 minutes.

---

## Summary: Priority Matrix

| # | Issue | Severity | Effort | Quick Win? |
|---|---|---|---|---|
| 1 | Dead `distanceMeters` | Low | Trivial | Yes |
| 3 | GPS→Schedule jumps | High | Medium | No (needs state) |
| 5 | Haversine/OSRM mismatch in `recentRuns` | Medium | Medium | No |
| 6 | N<3 blend instability | Medium | Low | Yes (add gate) |
| 7 | No direction detection | Low* | Medium | No |
| 9 | Mean → Median for speed | Medium | Low | Yes |
| 10 | Last-stop delay only | Low-Med | Low-Med | Debatable |
| 13 | Hot-path `console.log` | Low | Trivial | Yes |
| 14 | `8.3` vs `8.33` | Negligible | Trivial | Yes |
| 15 | `FALLBACK_SPEED` undocumented | Low | Trivial | Yes (add comment) |
| 16 | Defaults never validated | High | High | No (needs data) |

*\#7 is low because OSRM already handles direction when available.*
