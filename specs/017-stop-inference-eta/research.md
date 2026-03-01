# Research: Stop Inference, ETA Computation & Tracking UI

**Feature**: `017-stop-inference-eta`
**Date**: 2026-03-01

## R1: Haversine Distance Calculation

**Decision**: Implement a pure haversine function in `src/lib/tracking/haversine.ts`.

**Rationale**: The haversine formula is the standard approach for computing great-circle distance between two lat/lng points on Earth. For distances under 100m (geofence detection), the haversine is more than accurate enough — Vincenty or other ellipsoidal formulas add complexity without meaningful precision improvement at this scale.

**Alternatives considered**:
- **Vincenty formula**: More accurate for long distances (>100km) but adds complexity. Geofence radii are 50m — haversine error is negligible.
- **Library (`geolib`, `turf.js`)**: Adds a dependency for a single function. YAGNI — the formula is ~10 lines of code.
- **Euclidean approximation**: Only valid near the equator with small distances. Bahia is at ~13°S, acceptable for V1 but haversine is equally simple and universally correct.

## R2: Stop Inference Strategy

**Decision**: Simple proximity check — if ping is within `geofence_radius_m` of a stop, mark it as "passed". No hysteresis, no dwell timer.

**Rationale**: V1 prioritizes simplicity. Urban van stops have clear geometry (van stops, passengers board, van leaves). A single ping within radius is a strong signal. GPS jitter at 50m radius is unlikely to cause false positives for stops the van hasn't reached — jitter is typically 5-15m in urban areas.

**Alternatives considered**:
- **Dwell timer (2+ pings within radius)**: More robust against GPS jitter but adds state tracking complexity. Defer to V2 if false positives appear in real-world data.
- **Enter/exit hysteresis**: Standard in geofencing but requires two radii and state machine. Over-engineering for V1.
- **Direction-of-travel filtering**: Check heading alignment with route direction. Requires route geometry data we don't have.

## R3: ETA Computation Model

**Decision**: Schedule-shifted delay — measure delay at last passed stop, apply same delay to next stop's scheduled time.

**Rationale**: Fixed urban van routes have consistent segment times. If the van is 5 minutes late at stop N, it's likely ~5 minutes late at stop N+1. This linear shift is the simplest model that provides actionable ETA to passengers.

**Alternatives considered**:
- **Rolling average delay**: Average delay across last 3 passed stops. Smoother but adds complexity and requires 3+ stops to be useful.
- **Segment-based speed estimation**: Use actual travel time between stops to predict remaining segments. Requires historical data accumulation and more complex math.
- **GPS speed extrapolation**: Use current speed + remaining distance. Requires route geometry (not just stop points).

## R4: Route Run Lifecycle

**Decision**: Create `route_run` on first ping of the day (upsert on `route_id + service_date`). Bulk-insert all `route_run_stops` as `pending` on creation. Never delete — the run persists for the day.

**Rationale**: The upsert pattern is idempotent — multiple concurrent pings won't create duplicate runs. Bulk-inserting stops upfront simplifies inference (just update existing rows, don't need to check-and-create).

**Alternatives considered**:
- **Lazy stop creation**: Create `route_run_stop` rows only when a stop is detected as passed. Simpler writes but makes "list all stops with status" harder (need LEFT JOIN against schedule_entries).
- **Scheduled job to create runs**: Create runs at the start of each route's schedule window. Adds a cron dependency for minimal benefit.

## R5: Wiring Inference into Tracking Endpoint

**Decision**: Call inference function inside a try/catch block after ping storage and van position update. Errors are logged but don't affect the 200 response.

**Rationale**: Inference is a side effect — the primary purpose of the endpoint is to store pings. If inference fails (e.g., the route has no stops with coordinates), the ping is still valuable. Coupling ping acceptance to inference success would make the system fragile.

**Alternatives considered**:
- **Background job/queue**: Decouple inference completely. Adds infrastructure complexity (queue, worker). YAGNI for the current scale (~1,200 pings/hour).
- **Supabase trigger/function**: Run inference in Postgres. Violates the "no Edge Functions" constraint and moves logic out of the TypeScript codebase.

## R6: API Response Extension Strategy

**Decision**: Add `progress` (nullable object) and `van.lastLat`/`van.lastLng` to existing route API responses. Keep existing `nextStop` (schedule-based) alongside the new inference-based `progress.nextStopId`.

**Rationale**: Additive changes preserve backward compatibility. The existing `nextStop` is still useful as a schedule reference. The new `progress` object provides inference-based data when available. UI can choose which to display based on availability.

**Alternatives considered**:
- **Replace `nextStop` with inference-based next stop**: Breaking change. Existing behavior relies on schedule-based next stop.
- **Separate endpoint**: `GET /api/routes/:id/progress`. Adds an extra API call for data that's always needed together with route info. YAGNI.

## R7: Admin UI for Stop Coordinates

**Decision**: Add collapsible lat/lng number inputs below each schedule entry in the existing editor. No map picker, no geocoding.

**Rationale**: KISS — admin users will copy-paste coordinates from Google Maps. A map picker would require a mapping library (Leaflet), adding significant bundle size and complexity for a rarely-used admin feature. Can be added in V2.

**Alternatives considered**:
- **Inline map picker (Leaflet)**: Better UX but heavy dependency for admin-only feature. Defer to V2.
- **Geocoding from stop name**: Unreliable for informal stop names (e.g., "Praça da Sé" could resolve to many locations). Also adds an external API dependency.
- **Separate admin page for coordinates**: Fragments the workflow. Better to keep it in the existing schedule editor.

## R8: Test Strategy

**Decision**: Unit tests only for pure functions (haversine, inference logic, ETA computation). No integration tests for API endpoints in V1.

**Rationale**: The three tracking modules are pure functions with well-defined inputs/outputs — ideal for unit testing. API endpoint testing would require mocking Supabase client and is lower-value when the business logic is well-tested in isolation. The project currently has zero tests; starting with high-value unit tests is pragmatic.

**Alternatives considered**:
- **Integration tests with test database**: High setup cost, the project has no test DB infrastructure yet.
- **Component tests for UI changes**: The UI changes are minimal (adding a few lines of text). Visual verification is more practical than component tests for these changes.

## R9: Test File Location

**Decision**: Place tests at `src/__tests__/tracking/*.test.ts`.

**Rationale**: Vitest is already configured with `@` path alias and `globals: true`. The `src/__tests__/` pattern keeps tests separate from source while still within the `src/` directory that vitest scans. This follows standard vitest conventions.

**Alternatives considered**:
- **Co-located tests (`src/lib/tracking/__tests__/`)**: Also valid, but `src/__tests__/` provides a clearer project-wide test directory.
- **Top-level `tests/` directory**: Would need vitest config changes to include it.
