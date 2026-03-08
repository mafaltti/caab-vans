# Best Fixes

The best approach is not one big rewrite. Fix this in layers, starting with the gaps that can mislead users even when the data is technically valid.

---

## 1. Decouple Route Lifecycle from GPS Freshness

**Current issue:** `isRunning` becomes `false` when GPS is stale, even if a driver shift is still active (`routes API`).

**Best fix:**

- Make shift state the source of truth for operational state.
- Split API state into:
  - `runStatus`: `waiting | in_progress | idle | completed`
  - `trackingStatus`: `live | stale | missing`
- Keep `isRunning` only as a compatibility field, then migrate the UI to the two-field model.

**Why this is best:**

- Removes the false impression that the route ended.
- Preserves telemetry quality signals instead of hiding them inside one boolean.

**Tradeoff:** Small API/UI change, but low algorithmic risk.

---

## 2. Make Backfill Confidence-Gated, Not Unconditional

**Current issue:** Once one later stop matches, all earlier pending stops are auto-marked passed (`infer-stop-progress`).

**Best fix:**

- Introduce `passed_confirmed` vs `passed_inferred`, or keep `status` plus `inference_source`/`confidence`.
- Only backfill when one of these is true:
  - the driver started mid-route
  - the matched stop is overdue enough
  - there are 2 consecutive matching pings
  - the matched stop is several stops ahead, not just one marginal jump
- Show inferred backfills in UI as passed, but keep them distinguishable in storage.

**Why this is best:**

- Keeps the mid-route-start benefit.
- Reduces the blast radius of one false positive.

**Tradeoff:** Slight schema and query complexity increase, but this is the highest-value correctness fix.

---

## 3. Stop Using Exact Coordinates as the Logical Identity for Repeated Stops

**Current issue:** Repeated-stop handling groups by identical `lat/lng` strings (`infer-stop-progress`).

**Best fix:**

- Add a logical `stop_group_id` or `place_id` to `schedule_entries`.
- Group repeated occurrences by `stop_group_id`, not floating-point coordinate equality.
- Keep coordinate grouping only as fallback for legacy rows.

**Why this is best:**

- Matches the domain model: "same stop" is an operational concept, not a floating-point coincidence.
- Handles near-identical coordinates safely.

**Tradeoff:** Requires admin data cleanup or gradual backfill.

---

## 4. Use a Hybrid Raw/Snapped Position Policy Instead of Separate Truths

**Current issue:** Stop inference uses raw GPS, while ETA/display may use snapped GPS (`tracking ingestion`, `routes API`).

**Best fix:**

- Compute both raw and snapped distances to the target stop.
- For ETA/map: prefer snapped.
- For stop passage: use a confidence rule:
  - use snapped if snap distance from raw is small and the stop is road-adjacent
  - otherwise use raw
  - optionally require 2 pings when only one of the two sources supports the match

**Why this is best:**

- Snapped points are better for route geometry.
- Raw points are often better near off-road stops, depots, campuses, and parking areas.

**Tradeoff:** More logic, but much safer than switching entirely to snapped or entirely to raw.

---

## 5. Replace Uniform-Delay Fallback with Segment-Aware Fallback

**Current issue:** When GPS ETA is unavailable, ETA is `scheduled next stop + delay from last passed stop` (`eta fallback`).

**Best fix:**

- Keep the current fallback as the lowest tier.
- Add an intermediate fallback:
  - estimate next segment duration from last passed stop to next stop using `osrm_distance_m`, historical factors, and recent segment ratios from `time-factors`
  - only use pure uniform schedule shift when segment inputs are missing

**Why this is best:**

- Improves ETA without requiring fresh live GPS.
- Reuses data the system already stores.

**Tradeoff:** More compute and more edge cases, but isolated inside `eta.ts`.

---

## 6. Make Progress Resolution a Persisted Engine Output, Not an API Recomputation Detail

**Current issue:** Next-stop resolution is partly inferred in ingestion and partly reconstructed in API assembly (`infer-stop-progress`, `routes API`).

**Best fix:**

- Persist `last_passed_stop_id`, `next_stop_id`, and optionally `progress_confidence` on `route_runs`.
- Update them during ingestion.
- Treat the API as a reader, not another decision layer.

**Why this is best:**

- One source of truth.
- Easier debugging and less "why did the API choose this stop?" ambiguity.

**Tradeoff:** Slightly more write-side complexity.

---

## Recommended Order

1. Decouple `runStatus` from GPS freshness.
2. Confidence-gate backfill.
3. Add `stop_group_id`.
4. Hybrid raw/snapped stop matching.
5. Segment-aware fallback ETA.
6. Persist progress state explicitly.

---

## Operational Fixes

- Update `docs/ETA-CONFIGURATION.md` to match real OSRM timeouts in `osrm.ts`.
- Expose tracker health more explicitly from `tracker-health.ts`, especially for admin screens.
- Add shadow-mode metrics: run old and new stop inference in parallel for a while and compare outputs before switching fully.
