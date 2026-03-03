# Research: Road Snapping for Van GPS Positions

**Feature**: 033-road-snapping
**Date**: 2026-03-03

## R-001: Snapping Algorithm — `/match` vs `/nearest`

**Decision**: Use trajectory-based map matching (`/match` endpoint).

**Rationale**: `/match` uses a Hidden Markov Model (Viterbi algorithm) to find the most probable path on the road network from a sequence of GPS points with timestamps. It considers trajectory context, speed, and road topology. This resolves ambiguities at intersections and parallel roads that single-point `/nearest` cannot handle.

**Alternatives considered**:
- `/nearest` — single-point snap to closest road segment. Fast (sub-ms) but treats each point independently. Fails at intersections and parallel roads. Rejected for lower accuracy.

## R-002: Where to Snap in the Architecture — Ingestion Time

**Decision**: Snap at ingestion time in the tracking API (`POST /api/tracking/[vanId]`), after payload validation, before writing to the `vans` table.

**Rationale**: Snap once at ingestion means all downstream consumers (map display, ETA computation, route detail API) automatically receive corrected positions with zero code changes. Raw GPS is already preserved in `van_location_pings` (immutable audit trail). The existing vans table update logic (`last_lat`/`last_lng`) becomes the snapped position.

**Alternatives considered**:
- Query-time snapping (BFF) — snap in route detail API before responding. Rejected: repeated snapping on every poll is wasteful, must duplicate logic across APIs, adds latency to user requests.
- Client-side snapping — snap in the map component. Rejected: exposes infrastructure to public internet, requires CORS/auth, only fixes display (not ETA), adds mobile network latency.

## R-003: Storage Strategy — Dedicated Snapped Columns

**Decision**: Add `snapped_lat` and `snapped_lng` columns to the `vans` table. Store corrected coordinates there; serve them as `lastLat`/`lastLng` when available with raw fallback.

**Rationale**: Clean separation of raw vs corrected data. The existing `last_lat`/`last_lng` columns continue to hold raw GPS (used by geofence detection in `inferStopProgress`). The new `snapped_lat`/`snapped_lng` columns hold corrected values. The route detail API serves `snapped_lat ?? last_lat` and `snapped_lng ?? last_lng`.

**Alternatives considered**:
- Overwrite `last_lat`/`last_lng` with snapped values — rejected because geofence detection (`inferStopProgress`) needs raw GPS to avoid false positives from snapping to adjacent roads.
- Store in a separate table — rejected for unnecessary complexity; two nullable columns on `vans` is sufficient.

## R-004: Self-Hosted Engine — OSRM

**Decision**: Use OSRM (Open Source Routing Machine) as the self-hosted road-snapping engine.

**Rationale**: Simpler setup, faster queries (precomputed graph), official Docker images, largest community for map matching use cases. Zero per-request cost at any fleet size.

**Alternatives considered**:
- Valhalla (Meili) — same HMM algorithm, slightly lower RAM (~1-2 GB vs ~2-4 GB), but community Docker images, less battle-tested for this use case. Viable if RAM is tight (< 2 GB available).
- Commercial APIs (Mapbox, Google Roads, TomTom, HERE) — all incur per-request costs ($491-$2,915/month at current volume). Rejected per project's self-hosted philosophy.

## R-005: Map Data Source

**Decision**: Geofabrik Nordeste extract (~406 MB PBF), covering all of Bahia.

**Rationale**: Covers the entire service area. Processing time: ~15-30 minutes. Monthly updates are sufficient for the region (road changes are infrequent).

**Alternatives considered**:
- Full Brazil extract (~1.5 GB) — unnecessary coverage, larger processing time and RAM. Rejected for YAGNI.
- Per-state extract — Geofabrik doesn't offer Bahia-only; Nordeste is the smallest available region covering the service area.

## R-006: Infrastructure Placement

**Decision**: New Docker Compose stack at `infra/osrm/docker-compose.yml`. OSRM container accessible via `localhost:5000` from Next.js.

**Rationale**: Follows existing pattern of separate compose stacks (`infra/supabase/`, `infra/caab-vans/`). Keeps OSRM lifecycle independent from Supabase and the app.

**Alternatives considered**:
- Add OSRM service to existing `infra/supabase/docker-compose.yml` — rejected because OSRM is not related to Supabase and has its own lifecycle (data processing, monthly updates).

## R-007: Trajectory Window for `/match`

**Decision**: Use the last 5 GPS pings (including the current one) from `van_location_pings` as the trajectory for the `/match` call.

**Rationale**: At ~4 pings/minute, 5 pings covers ~75 seconds of travel. This provides enough trajectory context for accurate matching without excessive query overhead. The `/match` endpoint accepts 2-100 coordinates; 5 is well within the optimal range.

**Alternatives considered**:
- Single point (degenerate `/match` with 1 coordinate) — behaves like `/nearest`, loses trajectory benefits. Rejected.
- 10+ points — diminishing returns for accuracy, increases OSRM latency and `van_location_pings` query cost. Rejected per KISS.

## R-008: Failure Handling

**Decision**: OSRM is a soft dependency. On any error (connection refused, timeout, no match returned), fall back to raw GPS coordinates. The system operates exactly as before this feature.

**Rationale**: The tracking ingestion path must never fail due to OSRM unavailability. Current behavior (raw GPS) is the baseline; snapping is purely additive.

**Implementation**: Wrap the OSRM call in a try-catch with a 50ms timeout (enforces FR-011's `<50ms` latency constraint). On failure, log a warning and proceed with `snapped_lat = null`, `snapped_lng = null`. The route detail API already falls back: `snapped_lat ?? last_lat`. Typical OSRM localhost latency for 5 coordinates is 5-20ms, well within the 50ms budget.

## R-009: Geofence Detection Isolation

**Decision**: Geofence detection in `inferStopProgress` continues using raw GPS (`last_lat`/`last_lng`), NOT snapped coordinates.

**Rationale**: Snapping could move a position to a parallel road that is closer to (or within) a stop's geofence, causing false-positive stop detection. Raw GPS, while less precise, doesn't have this systematic bias.

**Alternatives considered**:
- Use snapped coordinates for geofence too — rejected due to risk of false positives at stops near parallel roads or intersections.

## R-010: Development Path

**Decision**: Three-phase rollout:
1. **Phase 1 (Dev)**: Use OSRM public demo server (`router.project-osrm.org`) — 1 req/sec rate limit, sufficient for development and testing.
2. **Phase 2 (VPS)**: Self-host OSRM on VPS with Nordeste extract.
3. **Phase 3 (Production)**: Enable in tracking ingestion with monitoring.

**Rationale**: Phase 1 allows development and testing without VPS changes. Phase 2 handles infrastructure. Phase 3 enables the feature in production.

## R-011: OSRM `/match` API Contract

**Decision**: Use the OSRM Match Service v1 API.

**Request format**:
```
GET /match/v1/driving/{lng1},{lat1};{lng2},{lat2};...?
  timestamps={t1};{t2};...&
  radiuses={r1};{r2};...&
  geometries=geojson&
  overview=false&
  annotations=false
```

**Key parameters**:
- `timestamps`: Unix timestamps (seconds) for each coordinate — enables speed-aware matching
- `radiuses`: GPS accuracy in meters per coordinate — tells OSRM how much to trust each point
- `geometries=geojson`: Return matched geometry in GeoJSON format
- `overview=false`: Skip full route geometry (we only need the snapped waypoints)
- `annotations=false`: Skip per-segment metadata

**Response**: JSON with `tracepoints` array. Each tracepoint has `location: [lng, lat]` (the snapped coordinate) or is `null` (point couldn't be matched).

**Snapped coordinate extraction**: `response.tracepoints[lastIndex].location` gives `[lng, lat]` for the most recent ping (the one being ingested).
