# Research: OSRM Route-Based ETA

**Feature**: 037-osrm-eta-baseline
**Date**: 2026-03-04

## Decision 1: OSRM `/route` vs `/match` for Distance

**Decision**: Use OSRM `/route` endpoint for point-to-point road distance.

**Rationale**: The existing `osrm.ts` uses `/match` (map-matching a trajectory). For ETA we need distance between van position → next stop, which is a simple A→B routing query. `/route` is the correct endpoint — it returns `distance` (meters) and `duration` (seconds) for the optimal driving path.

**Alternatives considered**:
- `/match` — designed for trajectory snapping, not point-to-point distance. Would require fabricating waypoints.
- `/table` — computes distance matrix, overkill for single origin-destination.

## Decision 2: Timeout for OSRM `/route`

**Decision**: 100ms timeout (vs 50ms for `/match` in existing code).

**Rationale**: `/route` is a simpler query than `/match` (no trajectory matching), but we give slightly more headroom since ETA accuracy depends on it. The existing `/match` uses 50ms; `/route` should be faster but 100ms provides safety margin. The fallback to haversine is instant.

**Alternatives considered**:
- 50ms (same as `/match`) — too tight, may cause unnecessary fallbacks.
- 200ms — too generous, could noticeably delay API responses.

## Decision 3: Making `computeEta` Async

**Decision**: Convert `computeEta` to async function.

**Rationale**: Currently synchronous. Adding OSRM `/route` call requires an async fetch. Both call sites (`/api/routes` and `/api/routes/[routeId]`) already run inside async handlers. The routes list endpoint already uses `Promise.all` for parallel processing, so adding `await` to `computeEta` has zero structural impact.

**Impact**:
- `src/lib/tracking/eta.ts`: `computeEta` → `async computeEta`, returns `Promise<EtaResult>`
- `src/app/api/routes/route.ts`: Add `await` before `computeEta()` call (already inside `Promise.all`)
- `src/app/api/routes/[routeId]/route.ts`: Add `await` before `computeEta()` call (already async handler)

## Decision 4: `osrmRoute()` Function Location

**Decision**: Add `osrmRoute()` to existing `src/lib/tracking/osrm.ts`.

**Rationale**: The file already contains OSRM integration (`snapToRoad`). Adding a `/route` helper here follows the existing pattern and keeps OSRM concerns in one place. No new file needed.

## Decision 5: Time Factor Storage

**Decision**: JSON file (`data/time-factors.json`) loaded at runtime, with hardcoded defaults as fallback.

**Rationale**:
- Simple file read, no DB schema changes needed.
- FR-014 requires hot-reload without restart — file watch or periodic re-read satisfies this.
- Nightly script writes the file; Next.js reads it on each request (or caches with short TTL).
- For new deployments, hardcoded defaults in code provide day-one functionality.

**Alternatives considered**:
- DB table — adds migration, more complex query path for a simple lookup table.
- Environment variables — can't represent nested hour-bucket structure.
- In-memory only — lost on restart, no persistence for nightly output.

## Decision 6: Recency Blend Weight

**Decision**: 70% historical / 30% recent (from analysis doc).

**Rationale**: Historical patterns are stable and cover the right time bucket. Recent data captures today's anomalies but may be from a different time bucket. 70/30 is a conservative blend that prevents overreaction to a single anomalous run. This matches the Transit App approach.

## Decision 7: Minimum Observations Threshold

**Decision**: 20 observations per time bucket before overriding defaults.

**Rationale**: With ~10 trips/day and 11 hour buckets × 3 day types = 33 buckets, weekday buckets accumulate ~2 observations/day. 20 observations ≈ 2 weeks of weekday data per bucket — sufficient to smooth outliers while converging reasonably fast. Saturday/Sunday buckets will take longer (4-5 weeks), which is acceptable since weekend patterns vary less.

## Decision 8: Nightly Script Approach

**Decision**: Standalone TypeScript script run via cron (`scripts/compute-time-factors.ts`).

**Rationale**:
- Matches existing script pattern (see `scripts/seed-schedule.ts`, `scripts/simulate-tracking.ts`).
- No scheduler infrastructure needed — just a cron job.
- Reads from Postgres (route_run_stops + van_location_pings), writes JSON file.
- Can be run manually for testing.

## Decision 9: `etaSource` Extension

**Decision**: Add `"gps_osrm"` to the existing union type.

**Rationale**: Distinguishes between OSRM road distance (`gps_osrm`) and haversine fallback (`gps`). The schedule fallback remains `"schedule"`. This enables monitoring OSRM usage vs fallback rate without breaking existing consumers — `"gps"` still exists, it just means "haversine fallback" now.

**Type change**: `"gps" | "schedule" | null` → `"gps" | "gps_osrm" | "schedule" | null`

## Decision 10: Correction Factor Applies to Haversine Fallback Too

**Decision**: Apply time-of-day correction factor to both road-distance and haversine fallback ETAs.

**Rationale**: Per clarification session — rush hour congestion affects travel time regardless of how distance was measured. Skipping the factor during OSRM fallback would make haversine ETAs even worse during peak hours.
