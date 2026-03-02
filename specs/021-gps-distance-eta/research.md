# Research: GPS-Distance-Based ETA

**Feature**: 021-gps-distance-eta | **Date**: 2026-03-02

## R1: Haversine utility availability

**Decision**: Reuse existing `haversineDistanceMeters()` from `src/lib/tracking/haversine.ts`.
**Rationale**: Function already implements the standard haversine formula, returns meters, and is used by `inferStopProgress()` for geofence checks. No modifications needed.
**Alternatives considered**: None — the utility exists and fits perfectly.

## R2: Van speed data availability

**Decision**: Use `vans.last_speed_mps` column, already stored by the tracking ingestion endpoint.
**Rationale**: The GPS ingestion endpoint (`/api/tracking/[vanId]`) already writes `last_speed_mps` to the `vans` table on every ping (confirmed in `route.ts` line 110). The column is `double precision` and stores meters per second. Currently unused by ETA logic — this feature will consume it.
**Alternatives considered**: Computing speed from consecutive pings was considered but rejected (adds complexity, `last_speed_mps` is device-reported and available).

## R3: Stop coordinates availability

**Decision**: Use `schedule_entries.stop_lat` and `schedule_entries.stop_lng` columns.
**Rationale**: These columns exist (added in migration `00002_live_tracking.sql`), are `double precision`, and are already used by `inferStopProgress()` for geofence detection. Some stops may have null coordinates — the feature handles this by falling back to schedule-based ETA.
**Alternatives considered**: None — coordinates exist in the schema.

## R4: Location freshness check

**Decision**: Use the `STALENESS_THRESHOLD_MINUTES = 10` constant already defined in `src/lib/time.ts`, consistent with the existing `isLocationFresh()` function.
**Rationale**: The 10-minute threshold is already established across the codebase. Reusing the same constant (or the same value) ensures consistency.
**Alternatives considered**: A shorter threshold (5 min) was considered but 10 min matches existing behavior.

## R5: Road correction factor

**Decision**: Use a fixed `ROAD_FACTOR = 1.3` multiplier on haversine distance.
**Rationale**: Standard approximation for urban/suburban areas where roads add ~30% over straight-line distance. Good enough for the current use case (fixed van routes in a city). Per spec, road-network routing is explicitly out of scope.
**Alternatives considered**: Per-route configurable factor (YAGNI — only one region served), real road routing via external API (out of scope, adds complexity and latency).

## R6: Minimum speed threshold

**Decision**: Use `MIN_SPEED_MPS = 1.0` (approximately 3.6 km/h).
**Rationale**: Below this speed, the van is effectively stopped or idling (walking pace). Dividing distance by near-zero speed would produce unrealistically large ETAs. Falling back to schedule-based ETA is more useful when the van is stationary.
**Alternatives considered**: 0.5 m/s (too low, catches GPS drift), 2.0 m/s (too aggressive, would miss slow urban traffic).

## R7: computeEta() extension approach

**Decision**: Add an optional `vanPosition?: VanPosition | null` parameter to `computeEta()`. When provided and all GPS conditions are met, compute ETA from distance/speed. Otherwise, use existing schedule-delay logic unchanged.
**Rationale**: Optional parameter preserves full backward compatibility — all existing callers that don't pass `vanPosition` get identical behavior. No breaking changes.
**Alternatives considered**: Separate `computeGpsEta()` function (rejected: would duplicate the "find next stop" logic; KISS favors a single function with a branch).

## R8: API route wiring

**Decision**: Both `/api/routes` and `/api/routes/[routeId]` will:
1. Include `last_speed_mps` in the van SELECT query.
2. Include `stop_lat`, `stop_lng` in the route_run_stops join on schedule_entries.
3. Build a `VanPosition` object from van data.
4. Pass stop coordinates and `vanPosition` to `computeEta()`.

**Rationale**: Both endpoints call `computeEta()` in near-identical patterns. The wiring is the same 3 small changes in each file. Per FR-007, GPS ETA must be consistent across both.
**Alternatives considered**: Extracting a shared helper (DRY threshold not met — only 2 occurrences, per constitution I).
