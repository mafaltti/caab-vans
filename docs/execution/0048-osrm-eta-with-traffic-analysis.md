# OSRM /route ETA with Traffic Awareness: Comprehensive Analysis

> Builds on [0047-osrm-vs-haversine-analysis.md](./0047-osrm-vs-haversine-analysis.md) — deep dive into Opportunity 1 (ETA via OSRM `/route`), extended with traffic-aware approaches.

---

## Executive Summary

The current ETA system uses `haversine × 1.3 / GPS speed`, producing ±30% error. This analysis evaluates replacing it with OSRM `/route` and adding traffic awareness.

**Key findings:**

1. **Strategy B (OSRM road distance + GPS speed)** is the best baseline — eliminates the `ROAD_FACTOR` hack while preserving real-time speed awareness. Expected improvement: ±30% → ±10-15%.

2. **For traffic awareness**, a phased approach is recommended:
   - **Phase 1**: OSRM `/route` baseline — OSRM road distance + real-time GPS speed (immediate, ~2-3 days)
   - **Phase 2**: Salvador-tuned Lua profile (low effort, ~3-5 days)
   - **Phase 3**: Time-of-day correction factors derived from historical GPS fleet data — applied **on top of** Phase 1's GPS-speed-based ETA, not replacing it (~1-2 weeks, needs ≥1 month of data)

3. **Design principle across all phases:** Real-time GPS speed is always the primary speed source. Historical data is used as a **correction factor** (e.g., "the rest of this route is typically 30% slower at 8 AM"), never as a replacement for what the van is actually doing right now.

4. **Approaches analyzed and NOT recommended** for CAAB's current scale (3-5 vans):
   - External traffic providers (HERE, TomTom) — over-engineered, segment mapping is a research project
   - Valhalla migration — disproportionate to the problem
   - OSRM segment-speed-file standalone — is the plumbing, not the solution

---

## Part 1: OSRM /route Baseline Analysis

### 1.1 Current State

The GPS-based ETA branch in `src/lib/tracking/eta.ts:80-114` computes travel time as:

```
travelMinutes = (haversineDistance * ROAD_FACTOR) / vanSpeed / 60
```

Where:
- `haversineDistance`: straight-line distance from van to next stop (meters)
- `ROAD_FACTOR = 1.3`: fixed multiplier to approximate road distance
- `vanSpeed`: GPS-reported speed in m/s (from `last_speed_mps`)
- `MIN_SPEED_MPS = 1.0`: threshold below which GPS branch is skipped

**Key problem:** The fixed 1.3 multiplier is a rough average. On Salvador/Bahia roads, the actual haversine-to-road ratio varies significantly:
- Straight coastal avenues (e.g., Av. Octavio Mangabeira): ~1.05-1.15
- Grid neighborhoods (e.g., Pituba): ~1.2-1.4
- Hillside/winding areas (e.g., Federação, Brotas): ~1.5-2.0+
- Routes with mandatory detours (one-way streets, overpasses): ~1.8-3.0

This means the current ETA can be off by -20% to +100% depending on the road geometry between the van and the next stop.

### 1.2 OSRM /route API Call

```
GET {OSRM_BASE_URL}/route/v1/driving/{vanLng},{vanLat};{stopLng},{stopLat}?overview=false
```

Response:
```json
{
  "code": "Ok",
  "routes": [{
    "distance": 8432.7,    // road distance in meters
    "duration": 612.3      // estimated travel time in seconds
  }]
}
```

### 1.3 Three Sub-Strategies Analyzed

#### Strategy A: Use OSRM Duration Directly

```typescript
const travelMinutes = osrmResult.duration / 60;
```

**Pros:** Simplest implementation. Duration accounts for road type, speed limits, turn penalties. No dependency on GPS speed accuracy.

**Cons:** OSRM uses OSM speed profiles (`car.lua` defaults), not real-time traffic. Salvador's real average urban speed is ~20-30 km/h during peak hours vs. OSRM's assumed ~50 km/h. **OSRM duration will consistently underestimate ETAs during congestion** by 40-60% during rush hour.

**Accuracy:** Off-peak ±10-15%; Peak hours -40 to -60%; **Overall ±25-35% — potentially worse than current.**

#### Strategy B: Use OSRM Road Distance + GPS Speed (Recommended)

```typescript
const osrmResult = await fetchOsrmRoute(vanPosition, nextStop);
const travelMinutes = osrmResult.distance / vanPosition.speedMps / 60;
```

**Pros:** Eliminates the `ROAD_FACTOR` hack. Preserves real-time speed awareness. GPS speed at >1 m/s is generally accurate (±0.5 m/s). Natural behavior: slower van → higher ETA.

**Cons:** Assumes current speed is constant for the remaining route. GPS speed is instantaneous — a van stopped at a light reports 0 m/s, triggering schedule fallback.

**Accuracy:** Steady-state ±5-10%; Variable-speed ±15-25%; **Overall ±10-15% — significant improvement.**

#### Strategy C: Hybrid (Weighted Blend)

```typescript
const osrmMinutes = osrmResult.duration / 60;
const gpsMinutes = osrmResult.distance / vanPosition.speedMps / 60;
const speedConfidence = Math.min(vanPosition.speedMps / 10, 1.0);
const travelMinutes = speedConfidence * gpsMinutes + (1 - speedConfidence) * osrmMinutes;
```

**Accuracy:** Overall ±8-12% — modest improvement over B with added complexity.

**Verdict:** Premature complexity. The weighting function becomes another tunable parameter.

### 1.4 Quantitative Comparison

| Scenario | Current (×1.3) | A (OSRM duration) | B (OSRM dist + GPS) | C (Hybrid) |
|---|---|---|---|---|
| Straight avenue, free-flow | ±15% | ±5% | ±5% | ±5% |
| Grid neighborhood, free-flow | ±10% | ±10% | ±5% | ±5% |
| Winding hillside road | ±40-60% | ±15% | ±10% | ±10% |
| **Rush hour congestion** | ±30% | **±50% (worse!)** | ±20% | ±15% |
| One-way detour | ±50-100% | ±10% | ±15% | ±12% |

**Key insight:** The current system's biggest errors come from **distance inaccuracy** (ROAD_FACTOR). Strategy B fixes this directly. The **speed component is actually the strength** — it reflects real-time conditions. Strategy A throws away this strength.

### 1.5 Latency Impact

| Phase | API Response | Delta |
|---|---|---|
| Current | ~25-55ms | — |
| With OSRM /route | ~30-70ms | +5-15ms |

For the route list endpoint (5 routes), parallel `Promise.all` reduces total OSRM overhead to ~10-20ms.

### 1.6 Recommendation

**Strategy B (OSRM road distance + GPS speed)** is the clear winner:
1. Addresses the root cause (distance inaccuracy)
2. Simplest correct approach
3. Expected improvement: ±30% → ±10-15%
4. Zero-risk deployment (50ms timeout + haversine fallback)
5. Minimal code change (~50 lines)
6. Infrastructure already exists

---

## Part 2: Traffic-Aware Approaches

### 2.1 Approach A: OSRM segment-speed-file (Built-in Traffic)

OSRM supports experimental traffic via CSV files:
```
from_osm_id,to_osm_id,edge_speed_in_km_h
123456,789012,25
```

With MLD: `osrm-customize --segment-speed-file updates.csv` (fast re-customization).

| Dimension | Assessment |
|---|---|
| Complexity | 4/5 — needs data source, OSM ID mapping, CSV pipeline, scheduled re-customization |
| Infra cost | Low incremental — same OSRM instance |
| Accuracy | High (if data is good) |
| Cold start | Depends on data source |
| Latency | None at query time (pre-baked) |
| **CAAB fit** | **Poor standalone** — this is the mechanism, not the solution. Needs Approach C or D for data. "Experimental" since 2016. |

**Key risks:** OSM ID mapping fragility (re-extract invalidates CSVs), poorly documented (GitHub issue [#7011](https://github.com/Project-OSRM/osrm-backend/issues/7011) closed unresolved).

### 2.2 Approach B: Custom Lua Profile for Salvador

Adjust default `car.lua` speed assumptions:
```lua
speed_profile["residential"] = 18  -- default 25 (narrow Salvador streets)
speed_profile["primary"] = 45      -- default 65 (congested primary roads)
```

| Dimension | Assessment |
|---|---|
| Complexity | 2/5 — one-time Lua edit + data reprocessing |
| Infra cost | Zero |
| Accuracy | Low-Medium (fixes systematic speed errors, no time-of-day) |
| Cold start | None |
| **CAAB fit** | **Good baseline** — low-effort correction for Salvador's urban reality |

### 2.3 Approach C: Historical GPS Fleet Data → Time-of-Day Speed Profiles

Pipeline: `van_location_pings → OSRM /match → segment speeds → CSV → osrm-customize`

| Dimension | Assessment |
|---|---|
| Complexity | 5/5 — batch map-matching, aggregation, time-bucketing, scheduled customize |
| Accuracy | Very High — actual speeds from exact vehicles on exact roads |
| Cold start | **Severe — needs weeks/months** (20+ observations per segment per time bucket) |
| **CAAB fit** | **Excellent long-term**, poor short-term. Fixed routes = high data density over time. |

### 2.4 Approach D: External Traffic Providers (HERE, TomTom, Google)

| Provider | Free Tier | Strength | Weakness |
|---|---|---|---|
| HERE | 250K/month | Real-time + historical | Proprietary segment IDs → OSM mapping |
| TomTom | 2.5K/day | Pre-built historical profiles | Same mapping challenge |
| Google | $200/month credit | Traffic levels | Qualitative only (fast/moderate/slow) |

| Dimension | Assessment |
|---|---|
| Complexity | 4/5 — API is easy, segment-to-OSM mapping is a research project |
| **CAAB fit** | **Over-engineered** for 3-5 vans on fixed routes in one city |

### 2.5 Approach E: Valhalla Migration

Native time-dependent routing with speed tiles. Dynamic costing at query time.

| Dimension | Assessment |
|---|---|
| Complexity | 5/5 — full engine migration |
| Query latency | ~50-200ms (vs OSRM ~5-20ms) |
| **CAAB fit** | **Poor** — massive investment for marginal improvement over simpler approaches |

### 2.6 Approach F: Hybrid — OSRM Road Distance + Time-of-Day Speed Adjustment

The simplest traffic-aware approach:

```typescript
const WEEKDAY_FACTORS: Record<number, number> = {
  6: 1.0,   // 6 AM — light traffic
  7: 1.25,  // 7 AM — building
  8: 1.45,  // 8 AM — peak morning rush
  9: 1.20,  // 9 AM — easing
  17: 1.40, // 5 PM — evening rush
  // ...
};

const factor = WEEKDAY_FACTORS[currentHour] ?? 1.0;
const travelMinutes = (osrmDistance / gpsSpeed / 60) * factor;
```

| Dimension | Assessment |
|---|---|
| Complexity | **1/5** — lookup table + multiplication |
| Infra cost | Zero |
| Accuracy | Medium — captures 80/20 of traffic variation |
| Cold start | Minimal — seed with known Salvador rush hours, refine from data |
| **CAAB fit** | **Excellent** — perfect for small fleet, fixed routes, zero engineering investment |

### 2.7 Comparison Matrix

| Approach | Complexity | Accuracy | Cold Start | CAAB Fit | Score |
|---|---|---|---|---|---|
| **F: Hybrid (OSRM + Factor)** | 1/5 | Medium | Minimal | Excellent | **9.0** |
| **B: Custom Lua Profile** | 2/5 | Low-Med | None | Good | **7.5** |
| C: GPS Fleet Data | 5/5 | Very High | Severe | Good long-term | 5.5 |
| A: Segment Speed File | 4/5 | High (data-dep) | Data-dep | Poor alone | 5.0 |
| D: External Provider | 4/5 | High | None | Over-engineered | 5.0 |
| E: Valhalla Migration | 5/5 | Very High | Data-dep | Poor | 4.0 |

---

## Part 3: Phased Implementation Roadmap

### Phase 1: OSRM /route Baseline (Quick Win)

**Goal:** Replace `haversine × 1.3 / speed` with OSRM road distance + GPS speed.
**Scope:** S (Small) — ~2-3 days, <200 lines.

#### New Helper: `osrmRoute()`

Add to `src/lib/tracking/osrm.ts`:

```typescript
export interface OsrmRouteResult {
  distanceMeters: number;
  durationSeconds: number;
}

export async function osrmRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  osrmBaseUrl: string,
): Promise<OsrmRouteResult | null> {
  const url = `${osrmBaseUrl}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false&annotations=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return {
      distanceMeters: data.routes[0].distance,
      durationSeconds: data.routes[0].duration,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}
```

#### Integration into `computeEta()`

```typescript
// New GPS branch — OSRM-first with fallback:
let travelMinutes: number;

if (osrmResult) {
  // OSRM road distance + real-time GPS speed
  travelMinutes = osrmResult.distanceMeters / vanPosition.speedMps / 60;
} else {
  // Fallback: haversine × road factor / GPS speed
  const distanceMeters = haversineDistanceMeters(...);
  travelMinutes = (distanceMeters * ROAD_FACTOR) / vanPosition.speedMps / 60;
}
```

#### `etaSource` Extension

```typescript
etaSource: "gps" | "gps_osrm" | "schedule" | null;
```

- `"gps_osrm"` — OSRM road distance used (best accuracy)
- `"gps"` — haversine × 1.3 fallback
- `"schedule"` — schedule-delay fallback

#### Fallback Chain

```
1. OSRM road distance / GPS speed  → etaSource: "gps_osrm"
   ↓ (OSRM timeout/down/no route)
2. Haversine × 1.3 / GPS speed     → etaSource: "gps"
   ↓ (no GPS, stale position, van stopped)
3. Schedule time + delay offset     → etaSource: "schedule"
```

Fully backward-compatible. If `OSRM_BASE_URL` is not set, behavior is identical to today.

#### A/B Comparison Logging

```typescript
console.log(JSON.stringify({
  event: "eta_comparison",
  routeId, stopId,
  haversine: { distanceM, roadDistanceM, travelMinutes },
  osrm: { distanceM, durationSeconds, travelMinutes },
  gpsSpeedMps: vanPosition.speedMps,
  chosen: etaSource,
  timestamp: now.toISO(),
}));
```

#### Caching Strategy

Simple in-memory LRU with position bucketing (~50m grid, 60s TTL, max 100 entries). Optional — start without caching, add only if OSRM latency becomes measurable.

#### Files Changed

| File | Change |
|---|---|
| `src/lib/tracking/osrm.ts` | Add `osrmRoute()` function + types |
| `src/lib/tracking/eta.ts` | Make `computeEta` async, add OSRM branch, extend etaSource |
| `src/app/api/routes/[routeId]/route.ts` | Pass `osrmBaseUrl`, `await computeEta()` |
| `src/types/index.ts` | Add `"gps_osrm"` to `RouteProgress.etaSource` union |

#### Success Metrics

| Metric | Current | Target |
|---|---|---|
| ETA error vs actual arrival | ±30% | ±10-15% |
| p95 API latency increase | 0ms | <25ms |
| OSRM fallback rate | N/A | <5% |

---

### Phase 2: Salvador-Tuned Lua Profile

**Goal:** Improve OSRM speed estimates to reflect Salvador's actual road conditions.
**Scope:** M (Medium) — ~3-5 days.
**Prerequisite:** Phase 1 deployed + 1-2 weeks of comparison logs.

#### Custom Profile: `infra/osrm/profiles/salvador-car.lua`

```lua
speed_profile = {
  motorway        = 80,    -- default 90
  trunk           = 60,    -- default 85
  primary         = 45,    -- default 65 (Salvador primary is often congested)
  secondary       = 35,    -- default 55
  tertiary        = 30,    -- default 40
  residential     = 18,    -- default 25 (narrow streets, speed bumps)
  service         = 10,    -- default 15
}

properties.u_turn_penalty = 30   -- default 20
properties.traffic_signal_penalty = 3  -- default 2
```

#### Validation

Use Phase 1 comparison logs + actual travel times from `route_run_stops.passed_at`:

```sql
SELECT
  rs1.schedule_entry_id AS from_stop,
  rs2.schedule_entry_id AS to_stop,
  EXTRACT(EPOCH FROM (rs2.passed_at - rs1.passed_at)) / 60 AS actual_minutes
FROM route_run_stops rs1
JOIN route_run_stops rs2
  ON rs1.run_id = rs2.run_id AND rs2.passed_at > rs1.passed_at
ORDER BY rs1.passed_at;
```

---

### Phase 3: Time-of-Day Correction Factors from Fleet Data (High Value, Needs Data)

**Goal:** Improve Phase 1 ETA by applying a time-of-day correction factor derived from historical fleet GPS data — **without replacing real-time GPS speed**.
**Scope:** M-L (Medium-Large) — ~1-2 weeks.
**Prerequisite:** Phase 1 producing data for ≥1 month.

#### Design Principle: GPS Speed Is Always Primary

Phase 1 computes ETA as `osrmDistance / gpsSpeed`. This reflects what the van is doing **right now**. Phase 3 does NOT replace this with historical averages. Instead, it adds a correction factor that accounts for what will happen on the **rest of the route** — which the van's current speed can't predict.

**Why a correction factor, not a speed replacement:**
- A van at 40 km/h approaching a rush-hour corridor should get a *higher* ETA than `distance / 40 km/h` suggests
- A van at 10 km/h in a momentary jam that's about to clear should get a *lower* ETA than `distance / 10 km/h` suggests
- Historical averages capture corridor-level patterns; GPS speed captures the van's instant reality
- Combining them is strictly better than using either alone

#### Industry Alignment

This two-layer approach (routing engine baseline + data-driven correction) is the industry standard:

| Company | Layer 1 (Baseline) | Layer 2 (Correction) | Scale |
|---|---|---|---|
| **Uber (DeepETA)** | Routing engine segment traversal | Deep neural network predicting residual | Millions of trips/day |
| **Transit App** | Stop-to-stop historical travel times | ML model + **recency weighting** | Thousands/day per city |
| **Google Maps** | Segment travel times from crowdsourced GPS | Real-time traffic from billions of Android phones | Global |
| **CAAB (ours)** | OSRM `/route` distance + GPS speed | Correction factor table + **recency weighting** | ~10 trips/day |

The architecture is identical — the correction mechanism scales down appropriately. ML models need millions of observations; a lookup table with recency blending is the right tool at our data volume.

> References: [Uber DeepETA](https://www.uber.com/blog/deepeta-how-uber-predicts-arrival-times/), [Transit App: Better Predictions](https://blog.transitapp.com/better-predictions/), [ETA Accuracy Benchmark](https://github.com/TransitApp/ETA-Accuracy-Benchmark)

#### How It Works

```typescript
// Phase 1 baseline (unchanged):
const baseMinutes = osrmResult.distanceMeters / vanPosition.speedMps / 60;

// Phase 3 addition: correction factor with recency weighting
const factor = getTimeFactor(currentHour, dayOfWeek, routeId, recentRuns);
const travelMinutes = baseMinutes * factor;
```

The correction factor answers: **"Historically, how much do Phase 1 ETAs over- or under-predict at this time of day — and is today different from usual?"**

- `factor = 1.0` → Phase 1 is accurate at this hour, no correction needed
- `factor = 1.4` → Phase 1 underestimates by 40% at this hour (rush hour, GPS speed is momentarily fast but route ahead is slow)
- `factor = 0.85` → Phase 1 overestimates by 15% at this hour (off-peak, van currently slow but route ahead is clear)

#### Recency Weighting (borrowed from Transit App)

Transit App found that weighting **the last few hours** more than the historical average captures "today is unusually bad/good" — rain, events, construction. We adopt the same principle:

```typescript
// Blend historical average with today's recent observations
const historicalFactor = getHistoricalFactor(hour, dayOfWeek, routeId);  // from nightly script
const recentFactor = getRecentFactor(routeId, recentRuns);               // from today's runs

// If we have recent data, blend 70% historical + 30% recent
// If no recent data yet (first run of the day), use 100% historical
const factor = recentRuns.length > 0
  ? 0.7 * historicalFactor + 0.3 * recentFactor
  : historicalFactor;
```

**How `recentFactor` works:**
- Look at today's earlier runs on this route (e.g., morning run completed, now computing ETA for afternoon run)
- Compare actual travel times from those runs vs. what Phase 1 would have predicted
- If morning runs were 20% slower than predicted → `recentFactor ≈ 1.2`
- This captures day-specific conditions (rain, accident, unusual congestion) that historical averages miss

**Why 70/30 blend:**
- Historical patterns are stable and cover the right time bucket (e.g., "Tuesdays at 5 PM")
- Recent data captures today's anomalies but may be from a different time bucket (e.g., morning data applied to afternoon)
- 70/30 is a starting point — can tune based on observed accuracy. Transit App uses similar weighting.

#### Data Pipeline: Computing Correction Factors

```
van_location_pings + route_run_stops (Postgres)
        │
        ▼
  [Nightly script]
        │
        ├─ For each route run, compute actual stop-to-stop travel times
        │    (from route_run_stops.passed_at timestamps)
        │
        ├─ For each stop-to-stop segment, retrieve what Phase 1 would have predicted
        │    (OSRM distance / average GPS speed at the time)
        │
        ├─ Compute: correction_factor = actual_travel_time / predicted_travel_time
        │
        ├─ Aggregate by (route, day_of_week, hour_bucket) → median factor
        │
        ▼
  correction_factors.json (or DB table)
        │
        ▼
  Loaded by computeEta() at runtime — no OSRM changes needed
```

**Key advantage over the OSRM segment-speed-file approach:** No OSRM re-customization, no restart, no OSM node ID mapping. The correction factor lives in application code — a simple JSON lookup table.

#### Time Buckets

```
Day:  weekday (Mon-Fri) | saturday | sunday
Hour: 06-07 | 07-08 | 08-09 | 09-10 | 10-12 | 12-14 | 14-16 | 16-17 | 17-18 | 18-19 | 19-22
```

For CAAB vans (school/corporate transport):
- **Morning rush (06:30-08:30):** factor ~1.3-1.5 (ETAs typically underpredict)
- **Midday (10:00-14:00):** factor ~1.0 (Phase 1 is accurate)
- **Afternoon rush (16:30-19:00):** factor ~1.2-1.4

#### Cold Start Handling

1. **Day 1 (no data):** Seed with educated guesses based on Salvador rush hour patterns:
   ```typescript
   const DEFAULT_WEEKDAY_FACTORS: Record<number, number> = {
     6: 1.05, 7: 1.35, 8: 1.40, 9: 1.15,
     10: 1.0, 11: 1.0, 12: 1.0, 13: 1.0, 14: 1.0, 15: 1.0,
     16: 1.10, 17: 1.35, 18: 1.30, 19: 1.05,
   };
   ```
2. **Weeks 2-4:** Nightly script starts refining factors from actual data
3. **Month 2+:** Factors converge to route-specific, data-driven values

No cold start *problem* — the system works from day 1 with reasonable defaults, and gets more accurate over time.

#### Per-Route vs Global Factors

Start with **global factors** (same table for all routes). Once enough data accumulates:
- If routes show meaningfully different patterns (e.g., one coastal, one hillside), split into per-route factors
- Decision criterion: variance between routes > 15% for the same time bucket

#### Implementation

**New file:** `src/lib/tracking/time-factors.ts`

```typescript
interface TimeFactors {
  historical: Record<string, Record<number, number>>; // dayType → hour → factor
  routeOverrides?: Record<string, Record<string, Record<number, number>>>; // routeId → dayType → hour → factor
}

/**
 * Get the blended correction factor for the current time, combining:
 * - Historical average (from nightly script, 70% weight)
 * - Recent observations from today's runs (30% weight, if available)
 */
export function getTimeFactor(
  hour: number,
  dayOfWeek: number,
  routeId?: string,
  recentRuns?: RecentRunData[],
): number {
  const dayType = dayOfWeek >= 1 && dayOfWeek <= 5 ? "weekday"
    : dayOfWeek === 6 ? "saturday" : "sunday";

  // Historical factor (from nightly script output)
  const historicalFactor = routeOverrides?.[routeId]?.[dayType]?.[hour]
    ?? historical[dayType]?.[hour]
    ?? 1.0;

  // Recency factor (from today's earlier runs on this route)
  if (recentRuns && recentRuns.length > 0) {
    const recentFactor = computeRecentFactor(recentRuns);
    return 0.7 * historicalFactor + 0.3 * recentFactor;
  }

  return historicalFactor;
}

/**
 * Compute how today's runs compare to Phase 1 predictions.
 * Returns ratio of actual/predicted travel times from today's completed segments.
 */
function computeRecentFactor(recentRuns: RecentRunData[]): number {
  const ratios = recentRuns.map(r => r.actualMinutes / r.predictedMinutes);
  // Use median to resist outliers (e.g., one very long stop for boarding)
  return median(ratios);
}
```

**New script:** `scripts/compute-time-factors.ts`

```typescript
// Nightly job: compare Phase 1 predictions vs actual travel times
// Output: data/time-factors.json
async function main() {
  const runs = await queryRecentRuns(30); // days

  for (const run of runs) {
    // Actual travel time between consecutive stops
    const actual = run.passedAt[i+1] - run.passedAt[i];

    // What Phase 1 would have predicted
    const osrmDist = await osrmRoute(stop[i], stop[i+1]);
    const avgSpeed = averageGpsSpeed(run, stop[i], stop[i+1]);
    const predicted = osrmDist / avgSpeed;

    // Factor for this observation
    factors.push({ hour, dayOfWeek, routeId, ratio: actual / predicted });
  }

  // Aggregate: median factor per (dayType, hour)
  // + per-route overrides if variance between routes > 15%
  writeFactorsJson(aggregate(factors));
}
```

#### Files Changed

| File | Change |
|---|---|
| (New) `src/lib/tracking/time-factors.ts` | Factor lookup + recency blending |
| (New) `scripts/compute-time-factors.ts` | Nightly factor computation |
| (New) `data/time-factors.json` | Generated historical correction factors |
| `src/lib/tracking/eta.ts` | Apply factor after OSRM distance / GPS speed calc, pass recent run data |
| `src/app/api/routes/[routeId]/route.ts` | Query today's completed run segments for recency data |

#### Speed Source Comparison Across Phases

| Phase | Distance Source | Speed Source | Traffic Correction | ETA Formula |
|---|---|---|---|---|
| Current | Haversine × 1.3 | GPS speed | None | `haversine × 1.3 / gpsSpeed` |
| **Phase 1** | OSRM `/route` | **GPS speed** | None | `osrmDistance / gpsSpeed` |
| **Phase 2** | OSRM `/route` (tuned profile) | **GPS speed** | Better base distances | `osrmDistance / gpsSpeed` |
| **Phase 3** | OSRM `/route` | **GPS speed** | Historical factor + recency blend | `(osrmDistance / gpsSpeed) × blendedFactor` |

**GPS speed is never replaced.** Each phase improves a different component while keeping real-time speed awareness. The correction factor adjusts for corridor-level patterns and today's conditions — it does not substitute the van's actual speed.

---

### Phase 4: Advanced (Optional / Future)

**Consider Valhalla when:** Phase 3 time-bucketing becomes too complex, fleet grows to 10+, need isochrones.

**Consider external traffic (HERE, TomTom) when:** Historical profiles still produce >15% error, unusual events cause unpredictable delays.

---

## Cross-Cutting Concerns

### Graceful Degradation Chain

```
┌──────────────────────────────────────────────┐
│ OSRM road distance / GPS speed × time factor │ ← Phase 3 (best)
│ etaSource: "gps_osrm"                        │
└──────────┬───────────────────────────────────┘
           │ No time factor data (cold start)
           ▼
┌──────────────────────────────────────────────┐
│ OSRM road distance / GPS speed               │ ← Phase 1 (good)
│ etaSource: "gps_osrm"                        │
└──────────┬───────────────────────────────────┘
           │ OSRM timeout / down / no route
           ▼
┌──────────────────────────────────────────────┐
│ Haversine × 1.3 / GPS speed                  │ ← Current (acceptable)
│ etaSource: "gps"                              │
└──────────┬───────────────────────────────────┘
           │ No GPS / stale / van stopped
           ▼
┌──────────────────────────────────────────────┐
│ Schedule time + delay offset                  │ ← Always available
│ etaSource: "schedule"                         │
└──────────────────────────────────────────────┘
```

**GPS speed is used at every level except the schedule fallback.** Time factors are additive — they correct for corridor-level patterns, not replace real-time speed.

### Success Metrics Summary

| Phase | Key Metric | Current | Target |
|---|---|---|---|
| 1 | ETA error (median) | ±30% | ±15% |
| 1 | API latency impact | 0ms | <25ms p95 |
| 2 | OSRM duration accuracy | TBD | ±10% |
| 3 | Rush-hour ETA error (GPS speed + time factor) | TBD | ±5-8% |
| All | OSRM availability | N/A | >99.5% |

### Implementation Timeline

| Phase | Effort | Dependencies | Start |
|---|---|---|---|
| **Phase 1** | S (2-3 days) | None | Immediately |
| **Phase 2** | M (3-5 days) | Phase 1 + 1-2 weeks of logs | +2-3 weeks |
| **Phase 3** | L (1-2 weeks) | Phase 1 + ≥1 month of data | +6-8 weeks |
| **Phase 4** | XL | Phase 3 insufficient | Only if needed |

---

## Decision Criteria for Upgrading Beyond Phase 3

Consider full segment-level pipeline or external traffic only if:
1. Route-level correction factors still produce >5 minute ETA errors consistently
2. Fleet grows to 10+ vans (more data, more routes, more variance)
3. Routes change frequently (breaking the fixed-route assumption)
4. Users report ETA unreliability as a top complaint after Phase 1-3

---

## References

### Industry ETA Systems
- [Uber DeepETA: How Uber Predicts Arrival Times Using Deep Learning](https://www.uber.com/blog/deepeta-how-uber-predicts-arrival-times/) — Routing engine baseline + ML residual correction architecture
- [Uber: Engineering Routing Engine](https://www.uber.com/blog/engineering-routing-engine/) — Segment-based travel time estimation
- [Transit App: Better Predictions](https://blog.transitapp.com/better-predictions/) — Historical + recency weighting approach
- [Transit App: ETA Accuracy Benchmark](https://github.com/TransitApp/ETA-Accuracy-Benchmark) — Industry-standard accuracy measurement methodology
- [Transit App: How on-target is that ETA, really?](https://blog.transitapp.com/how-on-target-is-that-eta-really-now-theres-a-way-to-know/) — ETA accuracy analysis framework

### OSRM
- [OSRM Traffic Wiki](https://github.com/Project-OSRM/osrm-backend/wiki/Traffic)
- [OSRM API Documentation](https://project-osrm.org/docs/v5.24.0/api/)
- [OSRM Profiles Documentation](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/profiles.md)
- [OSRM vs Valhalla Comparison](https://github.com/Telenav/open-source-spec/blob/master/osrm/doc/osrm-vs-valhalla.md)
- [OSRM Traffic Integration Issue #7011](https://github.com/Project-OSRM/osrm-backend/issues/7011)

### Other
- [Free ETA Service with OSRM (MadDevs)](https://maddevs.io/blog/how-to-make-three-paid-eta-services-one-free/)
- [Valhalla Speed Tiles](https://www.mapzen.com/blog/speed-tiles/)
