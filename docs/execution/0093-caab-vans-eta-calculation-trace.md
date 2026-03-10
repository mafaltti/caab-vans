# CAAB Vans — ETA Calculation: Full Trace

## Step 1: Branch Selection

The system checks which ETA method to use (`eta.ts:134`):

```
gpsConditionsMet = hasCoords(✓) AND locationFresh(✓) AND
                   (isMoving(✗) OR isNearStop(✓) OR recentlyMoving(✗))
```

- `isMoving` = false (speed 0 < 1.0 m/s threshold)
- `isNearStop` = true (228m straight-line < 500m proximity threshold)
- `recentlyMoving` = false (no ping with speed ≥ 1.0 m/s in last 60s — van stopped 3.5 min ago)

**Result:** GPS+OSRM branch active (via proximity)

---

## Step 2: Effective Speed

Since `speedMps < MIN_SPEED_MPS` (`eta.ts:169`):

```
effectiveSpeed = FALLBACK_SPEED_MPS = 4.2 m/s
```

This is **not used** because OSRM is available — OSRM provides its own duration.

---

## Step 3: Base Travel Time

OSRM route result from Van 02's position to Mundo Plaza:

- Road distance: `2,787m` (vs `228m` straight-line — Av. Tancredo Neves requires a long detour)
- OSRM duration: `276.6 seconds` = `4.61 minutes`

```
baseTravelMinutes = osrmResult.durationSeconds / 60 = 4.61 min
```

---

## Step 4: Time Factor (Historical + Recent)

### Historical (`time-factors.ts:19`)

Hour 19, weekday → `1.05`

### Recent Runs (`buildRecentRuns`)

17 segments from today's passed stops:

| From → To | OSRM (m) | Actual (min) | Predicted (min) | Ratio |
|---|---|---|---|---|
| CAAB → Comércio | 3753 | 18.3 | 7.5 | 2.43 |
| Comércio → Fórum | 3263 | 6.2 | 6.6 | 0.95 |
| Fórum → Mundo Plaza | 6949 | 28.3 | 14.0 | 2.03 |
| Mundo Plaza → TRT-5 | 6451 | 13.3 | 13.0 | 1.02 |
| TRT-5 → Mundo Plaza | 3608 | 26.4 | 7.2 | 3.64 |
| ... (12 more segments) | ... | ... | ... | ... |
| Fórum → Mundo Plaza | 6949 | 46.9 | 14.0 | 3.36 |
| Mundo Plaza → Comércio | 6451 | 51.1 | 13.0 | 3.94 |

Sorted ratios median (17 values): `~1.64`

### Blended Factor (`time-factors.ts:151`)

```
0.7 × 1.05 + 0.3 × 1.64 = 1.23
```

---

## Step 5: Final ETA

```
travelMinutes = 4.61 × 1.23 = 5.67 min → ceil = 6 minutes
```

---

## The Problem

Both factors are being considered, but there is a structural issue: `buildRecentRuns` includes **dwell time at stops** (passenger boarding, waiting). Segments like TRT-5 → Mundo Plaza show ratio `3.64` — the van took `26.4 min` for what should be `7.2 min` of driving. Most of that extra time is the van sitting at TRT-5 loading passengers, not actual traffic. This inflates the recent factor, which paradoxically makes the blended ETA more accurate despite measuring the wrong thing.

The historical factor of `1.05` at hour 19 is quite low — it barely accounts for Salvador evening traffic. The recent runs data compensates for this by pulling the blended factor up to `~1.23`.
