# Research: Tracking Inference Fixes

**Date**: 2026-03-07
**Feature**: 051-tracking-inference-fixes

## 1. Backfill Confidence Gating Pattern

**Decision**: Query `van_location_pings` for recent pings at geofence-check time rather than maintaining in-memory state.

**Rationale**: `inferStopProgress` receives a single `(lat, lng)` per call with no memory of prior pings. The tracking endpoint already queries `van_location_pings` for the last 5 pings (for OSRM snap trajectory), so the pattern is established. When a geofence match is found, query pings within the past 5 minutes and count how many fall within the geofence radius using `haversineDistanceMeters`. This determines confidence level for backfill gating.

The `inferStopProgress` signature expands to accept optional snapped coordinates: `(supabase, vanId, lat, lng, snappedLat?, snappedLng?)`. The snapped coordinates are already available in both the single-ping tracking endpoint (`/api/tracking/[vanId]`) and the batch tracking endpoint (`/api/tracking-batch/[vanId]`). Both must be updated to pass snapped coordinates through.

Confidence rules:
- **High**: 2+ pings within 5 minutes inside the geofence
- **Medium**: Both raw and snapped positions inside the geofence (1 ping sufficient)
- **Backfill gating**: Only backfill if the confirmed stop has high/medium confidence, OR the skipped stop is overdue by >15 minutes, OR the jump is only 1 stop

**Alternatives considered**:
1. In-memory ring buffer per van — rejected because Next.js serverless doesn't guarantee memory persistence between invocations
2. Redis-backed recent ping cache — over-engineered for ~10 vans (YAGNI)
3. Separate confidence service — over-engineered, logic belongs in the inference function

## 2. Schema Migration Strategy

**Decision**: Three additive migrations (00011-00013) with nullable columns, text CHECK constraints (not enums), and minimal indexes. Deploy and validate independently.

**Rationale**: All new columns are nullable, so existing queries and inserts work without modification. Text with CHECK constraints is simpler to extend than Postgres enums (which require `ALTER TYPE ... ADD VALUE` outside transactions). Matches the existing pattern (`route_run_stops.status` uses text CHECK).

Migration order:
1. **00011** — Stop confidence metadata (`pass_source`, `pass_confidence` on `route_run_stops`)
2. **00012** — Stop group ID (`stop_group_id` on `schedule_entries`)
3. **00013** — Progress pointers (`last_passed_stop_id`, `next_stop_id`, `progress_updated_at` on `route_runs`)

Foreign keys on progress pointers use `ON DELETE SET NULL` — if a schedule entry is deleted, the pointer gracefully becomes null and triggers recomputation on the next request.

**Alternatives considered**:
1. Single migration for all changes — rejected; separate migrations allow independent deployment and rollback
2. Enum types — rejected; harder to extend in transactions
3. Separate `stop_groups` table — YAGNI, simple text tag is sufficient

## 3. Hybrid Raw/Snapped Displacement Calculation

**Decision**: Compute displacement using `haversineDistanceMeters(raw, snapped)` at geofence-check time. If displacement exceeds 50m, use raw coordinates; otherwise use snapped.

**Rationale**: Both raw and snapped coordinates are already stored on the `vans` table. The haversine call is pure math with negligible overhead. The 50m threshold aligns with the default geofence radius — if snapping moved the point more than the geofence itself, the snap matched an incorrect road.

The raw+snapped agreement check for confidence gating works naturally:
```
rawInGeofence = distance(raw, stop) <= radius
snappedInGeofence = distance(snapped, stop) <= radius
bothAgree = rawInGeofence && snappedInGeofence  // medium confidence
```

**Alternatives considered**:
1. Always use raw for geofence — simpler but wastes better accuracy of snapped for on-road stops
2. Weighted average of raw and snapped — no clear physical meaning, harder to debug
3. Configurable threshold via env var — YAGNI, 50m is well-grounded

## 4. Segment-Aware ETA Fallback

**Decision**: Insert a new tier in `computeEta` between GPS and schedule-delay fallback. Uses `osrm_distance_m` from `schedule_entries` plus `getTimeFactor` to estimate segment travel time.

**Rationale**: When GPS is stale but stops have been passed, the system already has per-segment road distances and historical time factors. The computation:
```
travelMinutes = (osrm_distance_m / REFERENCE_SPEED_MPS / 60) * timeFactor
eta = lastPassedStop.passedAt + travelMinutes
```

`REFERENCE_SPEED_MPS` (8.3 m/s, ~30 km/h) already exists in `time-factors.ts`. `getTimeFactor` already accepts `recentRuns` for blending. The `Stop` interface in `eta.ts` needs one addition: `osrmDistanceM?: number | null`.

Returns with `etaSource: "segment"`.

**Alternatives considered**:
1. Haversine distance with ROAD_FACTOR — less accurate than pre-computed OSRM distances
2. Interpolate position between stops — over-engineered without GPS data
3. Average segment estimate with schedule delay — adds complexity with marginal benefit

## 5. Progress Pointer Persistence

**Decision**: Update `last_passed_stop_id`, `next_stop_id`, and `progress_updated_at` on the `route_runs` row at the end of `inferStopProgress`, using a single Supabase `update` call on the already-known `run.id`.

**Rationale**: The function already computes these values and returns them, but they are discarded. The route APIs independently reconstruct progress by re-querying `route_run_stops`. Persisting during ingestion creates a single source of truth.

Atomicity is adequate without explicit transactions: `inferStopProgress` is only called when the `update_van_position` RPC returns `true` (ping is strictly newer), preventing out-of-order writes. A partial update (stops marked but pointers not written) is self-healing — the next ping rewrites correct pointers.

Phased rollout:
- **Phase 1 (write)**: Persist pointers during ingestion but route APIs still read `route_run_stops` as before
- **Phase 2 (read)**: Route APIs read persisted pointers as primary source

**Alternatives considered**:
1. Postgres trigger on `route_run_stops` — rejected; hidden complexity, violates BFF-computes-everything principle
2. Separate RPC for atomic stops+pointers update — more correct but YAGNI at current scale
3. Separate `route_run_progress` table — unnecessary 1:1 indirection
