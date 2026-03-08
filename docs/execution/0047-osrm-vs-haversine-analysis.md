# OSRM vs Haversine: Comprehensive Use-Case Analysis

## Current State

| What | Where | Method |
|---|---|---|
| Road snapping (map display) | `src/lib/tracking/osrm.ts` | OSRM `/match` |
| Van position for ETA input | `src/app/api/routes/[routeId]/route.ts` | Snapped coords (OSRM result) |
| Geofence detection | `src/lib/tracking/infer-stop-progress.ts:151-157` | Haversine |
| ETA distance calculation | `src/lib/tracking/eta.ts:81-88` | Haversine × 1.3 `ROAD_FACTOR` |
| Ping throttle (mobile) | `apps/van-tracker/src/location/task.ts:106-111` | Haversine |

---

## Opportunity 1: ETA with OSRM `/route` (High Impact)

**Current:** `eta.ts:88` — `travelMinutes = (haversine * 1.3) / speed / 60`

**Problem:** The fixed `ROAD_FACTOR = 1.3` is a rough guess. On winding Salvador roads, the actual factor varies from ~1.1 (straight avenues) to ~2.0+ (hillside neighborhoods). This makes GPS-based ETAs unreliable by ±30%.

**OSRM improvement:** Call `/route/v1/driving/{vanLng},{vanLat};{stopLng},{stopLat}` to get:

- Actual road distance (meters) — replaces `haversine * 1.3`
- Estimated travel duration (seconds) — could replace the entire speed-based calculation

**Tradeoffs:**

- Adds ~5-20ms per request (localhost OSRM)
- Already have OSRM running; no new infra cost
- Could cache route distances for known van→stop pairs (stops are fixed)
- Duration estimate uses OSRM speed profiles (better than raw GPS speed on its own)

**Verdict:** Best candidate for OSRM upgrade. Eliminates the biggest source of ETA error.

---

## Opportunity 2: Geofence with Road-Aware Distance (Medium Impact, High Risk)

**Current:** `infer-stop-progress.ts:151-157` — Haversine distance ≤ `geofence_radius_m` (50m default)

**Problem:** Van on a parallel road or overpass could be within 50m straight-line but not actually at the stop. Conversely, a van approaching on a curved road might be >50m straight-line but only 20m by road.

**OSRM option:** Use `/route` to check road distance to stop, or `/nearest` to verify van is on the same road segment as the stop.

**Why it's risky (and why spec 033 explicitly avoided it):**

- Snapping can put the van on the wrong road at intersections
- False positives (marking stops incorrectly) are worse than false negatives
- Current 50m radius + 30-min time window works well in practice
- OSRM adds latency to every ping (currently geofence check is pure math, <1ms)

**Verdict:** Don't change. The spec deliberately chose raw GPS for geofences (FR-007). The current approach is simpler, faster, and has acceptable accuracy for a 50m radius. If parallel-road false positives become a real problem, consider OSRM `/nearest` to verify road-segment match, but only then.

---

## Opportunity 3: Multi-Stop ETA / Route Progress (Medium Impact)

**Current:** ETA is computed only for the next stop. No estimate for stops 2, 3, 4... ahead.

**OSRM option:** Use `/route/v1/driving/{van};{stop1};{stop2};...` to get:

- Cumulative road distance and duration to every upcoming stop
- Full route geometry for rendering on map

**Benefits:**

- Users could see "ETA to my stop" not just "ETA to next stop"
- Enables a progress bar showing % of remaining route
- Route geometry could be overlaid on the map

**Tradeoffs:**

- Requires waypoint ordering (already known from schedule)
- Single OSRM call returns all legs
- ~10-30ms for a 15-waypoint route on localhost

**Verdict:** Good future feature. Not a Haversine replacement per se, but a natural extension once OSRM `/route` is integrated for ETA.

---

## Opportunity 4: Ping Throttling in Van-Tracker App (No Impact)

**Current:** `apps/van-tracker/src/location/task.ts:106-111` — Haversine < 5m = skip ping

**Why OSRM doesn't help:** This runs on the mobile device, offline. The 5m threshold is a rough "did the van move at all?" check. Road distance is irrelevant for this purpose — a 5m straight-line movement is a 5m road movement at this scale.

**Verdict:** Keep Haversine. OSRM adds no value and would require network calls on every GPS tick.

---

## Opportunity 5: Historical Route Analysis (Low Priority, New Capability)

Not currently implemented, but OSRM could enable:

- Actual vs. scheduled route comparison using `/match` on full trip pings
- Route deviation detection (driver took a different road)
- Fuel/distance analytics based on actual road distances traveled

**Verdict:** Future analytics feature. No Haversine to replace — this would be new functionality.

---

## Summary Matrix

| Use Case | Current | OSRM Service | Priority | Recommendation |
|---|---|---|---|---|
| ETA distance | Haversine × 1.3 | `/route` | High | **Replace** — biggest accuracy gain |
| Geofence check | Haversine ≤ 50m | `/nearest` or `/route` | Low | Keep Haversine — spec FR-007, risk of false positives |
| Map display | OSRM `/match` | Already done | Done | Already using OSRM |
| Multi-stop ETA | N/A | `/route` (multi-waypoint) | Medium | New feature, natural extension |
| Ping throttle | Haversine < 5m | N/A | None | Keep Haversine — runs offline on device |
| Route analytics | N/A | `/match` (full trip) | Low | Future analytics capability |

## Recommended Next Step

ETA via OSRM `/route` is the clear winner — it replaces the `ROAD_FACTOR = 1.3` hack with actual road distance/duration, uses infrastructure already deployed, and has the highest impact on user-facing accuracy. The change would be localized to `src/lib/tracking/eta.ts` (call OSRM instead of haversine + road factor) with a fallback to the current method if OSRM is unavailable.
