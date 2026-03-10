# Research: Cold-Start Stop Confirmation

**Date**: 2026-03-10 | **Branch**: `059-cold-start-confirm`

## R1: Start Endpoint — Body Parsing and Response Extension

**Decision**: Enrich existing `POST /api/routes/[routeId]/start` with optional `lat`/`lng` body params and `coldStart` response field.

**Rationale**: The endpoint currently ignores the request body entirely (`_request` unused). Adding optional GPS coords is backward-compatible — existing clients that send no body continue to work. The cold-start suggestion is computed server-side and included in the response only when conditions are met, so non-cold-start responses remain unchanged.

**Alternatives considered**:
- Separate `GET /api/routes/[routeId]/cold-start-suggestion` endpoint — rejected per analysis doc §5.5 ("no new GET endpoint needed"). Would require an extra round-trip and the suggestion data is only useful at start time.
- Passing GPS via query params — rejected; POST body is more appropriate for coordinate data.

**Key findings**:
- `_request` param is unused → change to `request` and parse body
- No Zod schema exists for start endpoint → create one with optional `lat`/`lng`
- Response shape: `{ shift: {...}, run: {...} }` → extend with optional `coldStart: {...}`
- `fetchWithAuth()` in route-card.tsx already handles JSON responses

## R2: Canonical Enforcement Extraction

**Decision**: Extract canonical prefix logic from `infer-stop-progress.ts:431-468` into `src/lib/tracking/enforce-canonical-prefix.ts`.

**Rationale**: The contiguous prefix logic is duplicated:
- `infer-stop-progress.ts:431-468` — enforces and heals in DB
- `resolve-route-progress.ts:148-161` — in-memory demote for ETA math

The new `confirm-start-stop` endpoint will be the 3rd consumer, meeting the DRY ≥3 threshold from the constitution.

**Alternatives considered**:
- Inline the logic in confirm-start-stop (copy-paste) — rejected; 3 occurrences with identical logic meets extraction threshold.
- Extract only the prefix computation, keep DB writes inline — this is the chosen approach. The helper computes `{ contiguousPassedIds, healIds }` and callers handle persistence.

**Key findings**:
- Canonical enforcement walks `allStops` in schedule order
- Stops after the first non-passed stop that are marked passed → heal IDs (reverted to pending)
- Pointer derivation: `lastPassedStopId` = last in prefix, `nextStopId` = first after prefix
- Pointer persistence: UPDATE on `route_runs` with `progress_updated_at`

## R3: Seeding Logic Reuse

**Decision**: Extract seeding logic from `infer-stop-progress.ts:95-133` into a shared helper callable by both `inferStopProgress` and `confirm-start-stop`.

**Rationale**: The confirm endpoint must seed `route_run_stops` if they don't exist yet (FR-009). The seeding logic is non-trivial (count check + bulk insert) and already implemented. With 2 callers, this is borderline for extraction but justified because the logic must be identical — divergent seeding would cause data inconsistencies.

**Key findings**:
- Seeding queries `schedule_entries` for the route, inserts all as `{ run_id, schedule_entry_id, status: "pending" }`
- Seeding gate: `stopCount === 0` check
- No coordinates or time metadata in seeded rows

## R4: UI Modal Pattern

**Decision**: Use existing Radix UI Dialog pattern (already in `src/components/ui/dialog.tsx`) for the confirmation modal.

**Rationale**: The end-shift dialog in `route-card.tsx:218-245` provides an exact pattern to follow. Same component library, same controlled state approach, same file.

**Key findings**:
- Dialog components: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- State management: `useState(false)` for open/close
- Error display pattern: `{error && <p className="text-sm text-red-600">{error}</p>}`
- The confirmation modal replaces the direct `handleStart()` call — instead, `handleStart()` fires, and if the response includes `coldStart`, the modal opens with suggestion data.

## R5: GPS Source Priority Chain

**Decision**: Three-tier GPS fallback: browser geolocation → fresh van ping (≤5min) → time-only list.

**Rationale**: Browser geolocation is the primary source (most accurate, most recent). Van ping fallback covers cases where browser geolocation is denied or unavailable. Time-only fallback ensures the feature is still useful without any GPS.

**Key findings**:
- Browser geolocation: Accessed via `navigator.geolocation.getCurrentPosition()` in the web app before calling start
- Van pings: `van_location_pings` table with `received_at` timestamp — query latest where `received_at >= now - 5min`
- `haversineDistanceMeters` at `src/lib/tracking/haversine.ts` — reuse for proximity filter
- Schedule entries have `stop_lat`/`stop_lng` (nullable) and `scheduled_departure` (HH:mm string)

## R6: Existing Infrastructure Verification

**Decision**: No DB migration needed. All required columns and constraints already exist.

**Rationale**: Verified against actual schema:
- `pass_source` CHECK includes `'manual'` (migration 00011)
- `pass_confidence` column exists with 0.0-1.0 range (migration 00011)
- `PassSource` TypeScript type includes `"manual"` (src/types/index.ts:5)
- `route_run_stops` composite PK: `(run_id, schedule_entry_id)`
- `route_runs` has `next_stop_id`, `last_passed_stop_id`, `progress_updated_at`
