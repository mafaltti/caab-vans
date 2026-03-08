# ETA System — Gaps & Improvement Opportunities

Consolidated analysis across all four deep dives.

---

## HIGH Impact

| # | Gap | Detail |
|---|---|---|
| 1 | Dead variable: `distanceMeters` in OSRM branch | `eta.ts:110` assigns `osrmResult.distanceMeters` but it's never used when OSRM succeeds — `baseTravelMinutes` comes from `durationSeconds` (line 134). Dead code from the pre-fix era. |
| 2 | Single-stop ETA only | System computes ETA for only the immediate next stop (line 79). A passenger waiting at stop 5 while the van is at stop 2 sees no ETA — just scheduled times. No dwell time at intermediate stops is modeled. |
| 3 | GPS→Schedule transitions cause jarring jumps | Van stops at a traffic light (speed < 1 m/s, >500m away) → falls back to schedule. User sees "~3 min" (GPS) → "~15 min" (schedule+delay) → "~2 min" (GPS resumes). `etaSource` is computed but never shown in UI — jumps appear erratic. |
| 4 | `time-factors.json` never generated | The nightly script (`scripts/compute-time-factors.ts`) has never been run. System uses hardcoded defaults for all congestion factors. No learning from actual traffic. |
| 5 | `buildRecentRuns()` uses haversine, training script uses OSRM | Runtime factor calibration uses `haversine × 1.3` (`time-factors.ts:86`), but the nightly script uses OSRM road distance. Different distance bases produce inconsistent ratios. |

---

## MEDIUM Impact

| # | Gap | Detail |
|---|---|---|
| 6 | 70/30 blend with 1-2 samples | `getTimeFactor()` blends `0.7 × historical + 0.3 × recent` always (`time-factors.ts:134`). With only 1 passed stop, the "recent" factor is a single ratio — no statistical power. Should require N≥3 or weight by sample size. |
| 7 | No direction detection | Van moving away from stop is treated identically to moving toward it. No bearing/trajectory analysis. GPS drift or wrong turns produce optimistic ETAs. |
| 8 | `ROAD_FACTOR = 1.3` inadequate for divided roads | On Av. ACM, real road-to-haversine ratio is 2.7–10x. When OSRM is down, `haversine × 1.3` severely underestimates travel time on one-way/divided roads. |
| 9 | Simple mean for speed smoothing | `computeSmoothedSpeed()` (lines 37-41) uses arithmetic mean of non-zero speeds. A single GPS spike (e.g., 40 m/s noise) skews the result. Median or EMA would be more robust. |
| 10 | Schedule fallback uses only last stop's delay | Lines 200-203: if delay is worsening across stops (+2, +5, +10 min), only the last value (+10) is used. No trend detection or averaging. |
| 11 | Sunday factors missing | `DEFAULT_SUNDAY_FACTORS` is an empty object (line 37). All Sunday ETAs get `timeFactor = 1.0` (zero congestion adjustment). |

---

## LOW Impact

| # | Gap | Detail |
|---|---|---|
| 12 | No client-side countdown | Frontend polls every 5s and displays `Math.ceil(minutes)`. ETA appears as jerky integer steps, not a smooth countdown. |
| 13 | `console.log` on every ETA computation | Lines 147-159: JSON log fires on every request. ~100+ logs/min with 5 vans. Production noise. |
| 14 | `REFERENCE_SPEED_MPS` mismatch | `time-factors.ts` uses `8.3`, nightly script uses `8.33`. Should be identical. |
| 15 | `FALLBACK_SPEED_MPS = 4.2` undocumented | No justification for why 15 km/h. Is it observed median crawl speed? An educated guess? |
| 16 | Hardcoded defaults unvalidated | The rush-hour multipliers (1.35 at 7am, 1.4 at 8am) have no documented origin. Are they realistic for Salvador? |

---

## Suggested Priority Order

### Quick wins (low effort, meaningful impact)

1. Remove dead `distanceMeters` assignment in OSRM branch (cleanup)
2. Require N≥3 recent runs before blending (prevents noisy early-route factors)
3. Replace speed smoothing mean with median (robustness against GPS spikes)
4. Add Sunday baseline factors (e.g., 0.95x)

### Medium effort, high value

5. Expose `etaSource` in UI (small icon/badge — builds user trust)
6. Add hysteresis to GPS→schedule transitions (keep GPS ETA for ~15s after speed drops)
7. Run nightly script and deploy actual traffic factors

### Larger investments (when product requires)

8. Multi-stop ETA via OSRM multi-waypoint routing + dwell time estimates
9. Use OSRM in `buildRecentRuns()` for training/runtime consistency
10. Direction-aware ETA (trajectory bearing analysis)
