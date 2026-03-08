# Research: Fix ETA Computation

**Feature**: 044-fix-eta-computation
**Date**: 2026-03-06

## R1: Current ETA Computation Flow

**Decision**: The ETA logic lives in `src/lib/tracking/eta.ts`. The `computeEta()` function has two branches:

- **GPS branch** (line 74-83): Enters when `vanPosition.speedMps >= MIN_SPEED_MPS (1.0)` AND location is fresh (<10 min). Computes distance via OSRM or haversine x 1.3, then divides by instantaneous speed: `baseTravelMinutes = distanceMeters / speedMps / 60`. Applies `timeFactor` from `time-factors.ts`.
- **Schedule branch** (line 163-192): Fallback. Uses scheduled times + observed delay from last passed stop.

**Rationale**: Understanding the current flow is essential to make targeted fixes without breaking existing behavior.

**Alternatives considered**: N/A — this is discovery, not a decision.

## R2: OSRM Duration Goes Unused

**Decision**: In `src/lib/tracking/osrm.ts`, the `osrmRoute()` function returns `{ distanceMeters, durationSeconds }`. In `eta.ts` line 99-102, only `distanceMeters` is extracted. The `durationSeconds` field exists in the return type but is never read by the caller.

**Rationale**: The fix is straightforward — use `osrmResult.durationSeconds / 60` as `baseTravelMinutes` instead of `distanceMeters / speedMps / 60` when OSRM data is available.

**Alternatives considered**:

- Blend OSRM duration with speed-based calculation: Rejected — OSRM duration is strictly better than distance/speed.
- Use OSRM duration without timeFactor: Rejected — OSRM uses static OSM speed limits, not real-time traffic. The timeFactor (from historical data) still adds value.

## R3: Recent Speed Readings for Smoothing

**Decision**: The `van_location_pings` table stores every GPS ping with `speed_mps`. The route detail API (`src/app/api/routes/[routeId]/route.ts`) currently queries the `vans` table for `last_speed_mps` (single value). To get the 10 most recent pings, add a query to `van_location_pings` ordered by `device_ts DESC LIMIT 10` for the van_id, and extract their `speed_mps` values.

**Rationale**: The data already exists in the database. No new collection is needed. The `van_location_pings` table has an index on `(van_id, received_at DESC)` which supports this query efficiently.

**Alternatives considered**:

- Store smoothed speed on the `vans` table: Rejected — adds write complexity to the ingestion path and a new column. Computing on read is simpler and the query is cheap (10 rows, indexed).
- Pass speed history through the tracker app: Rejected — would require tracker changes (out of scope) and the data already exists server-side.

## R4: Handling Speed=0 Within 500m

**Decision**: Modify the GPS branch entry condition in `eta.ts`. Currently requires `speedMps >= 1.0`. New logic: enter GPS branch if EITHER (a) speed >= 1.0 m/s, OR (b) speed < 1.0 m/s AND haversine distance to next stop <= 500m. When (b), use fallback speed of 4.2 m/s (~15 km/h) for computation.

**Rationale**: The proximity check is cheap (haversine is pure math, already imported). The 500m threshold and 15 km/h fallback were clarified with the user during `/speckit.clarify`.

**Alternatives considered**:

- Always enter GPS branch regardless of speed: Rejected — a van parked 5km from a stop at speed 0 should use schedule-based ETA.
- Use last known non-zero speed: Rejected — could be stale (parked overnight). The fixed 15 km/h fallback is more predictable for short distances.

## R5: Impact on Existing Tests

**Decision**: `src/__tests__/tracking/eta.test.ts` has 29 existing tests. Tests that mock `vanPosition.speedMps >= 1.0` will continue to pass since the GPS branch conditions are being relaxed (not tightened). Tests that check schedule fallback when speed=0 need updating to account for the new proximity-based path. New tests needed for: (1) speed=0 within 500m, (2) OSRM duration usage, (3) smoothed speed averaging.

**Rationale**: Existing test coverage is good; changes are additive. The test file uses mocked OSRM responses, so testing OSRM duration is straightforward.

**Alternatives considered**: N/A.

## R6: Database Schema Changes

**Decision**: No schema changes required. All needed data already exists:

- `van_location_pings.speed_mps` — for smoothed speed query
- `van_location_pings` index on `(van_id, received_at DESC)` — supports the 10-row query
- OSRM `durationSeconds` — already returned by `osrmRoute()`, just unused

**Rationale**: No migration needed. This is purely a computation logic change + a new read query.

**Alternatives considered**: Adding a `smoothed_speed_mps` column to `vans` table — rejected (see R3).
