# Research: Tracking Reliability Fixes

**Branch**: `071-tracking-fixes` | **Date**: 2026-03-13

## Research Summary

All four source files were analyzed. No unknowns remain — the existing codebase provides all necessary primitives. No new dependencies or database migrations are required.

---

## R1: Deferred Event Status Update (Issue 3)

**Decision**: Use existing `updateEventStatus(supabase, vanId, eventId, "no_match")` before the `return` in the contiguous-prefix guard.

**Rationale**: The function already exists at line 326 of `process-device-geofence-events.ts`, is called from 7 other guard paths, and only accepts `"no_match"` as the status literal type. The duplicate-detection logic (lines 76-84) already resets `no_match` → `received` when the device resends the same event, enabling re-evaluation.

**Alternatives considered**:
- **New `deferred` status**: Would require a database migration (CHECK constraint change), schema update, and client-side handling. Over-engineered for this case.
- **Server-side retry queue**: YAGNI — the device already retries by resending events on each ping.

**Key code context**:
- Guard block: lines 272-286 — `if (matchedIndex > 0) { ... return; }`
- `updateEventStatus`: lines 326-343 — updates `tracking_geofence_events.status`
- Duplicate handler: lines 76-84 — `if (existing.status === "no_match")` resets to `received`

---

## R2: Batch `.in()` Query (Issue 4B)

**Decision**: Split `submittedEventIds` into chunks of 50 before calling `.in()`, and add `.max(100)` to the `geofenceEvents` Zod schema.

**Rationale**: Kong's default `client_header_buffer_size` is 4KB and `large_client_header_buffers` is 4×8KB. A UUID is 36 chars; 50 UUIDs in a PostgREST `?event_id=in.(...)` filter ≈ 2KB, safely under limits. The `.max(100)` validation cap prevents unbounded payloads at the schema boundary.

**Alternatives considered**:
- **Increase Kong buffer sizes only**: Treats symptom, not root cause. The unbounded query would still fail at higher event counts.
- **Switch to RPC (POST body)**: Avoids URL length limits entirely but requires a new Postgres function. Over-engineered — batching solves the problem within existing patterns.

**Key code context**:
- `appendGeofenceResponse`: lines 223-276 in `route.ts` — single `.in("event_id", submittedEventIds)` call
- Schema: line 23 in `tracking.ts` — `z.array(geofenceEventSchema).optional()` (no `.max()`)
- Batch schema already uses `.max(100)` for `points` array (line 27), establishing the pattern

---

## R3: Reprocess `no_match` Events on Shift Creation (Issue 2)

**Decision**: After shift insert in the start handler, query `no_match` events for the van's service date and call `processDeviceGeofenceEvents` with a try/catch wrapper (FR-008).

**Rationale**: The start handler already has all required context in scope: `van.id`, `serviceDate` (YYYY-MM-DD from `todayBahiaDate()`), and a service-role `supabase` client. `processDeviceGeofenceEvents` is already exported and handles duplicates gracefully — the upsert is a no-op for existing events, and the duplicate path resets `no_match` → `received` for reprocessing.

**Alternatives considered**:
- **Database trigger on `route_shifts` INSERT**: Requires PL/pgSQL, harder to test, breaks the "no Edge Functions" constraint spirit.
- **Cron job**: Adds operational complexity for a scenario that only occurs during shift creation.

**Key code context**:
- Shift insert: lines 120-128 in `start/route.ts`
- In-scope variables: `van` (with `.id`), `serviceDate` (string), `supabase`, `runId`
- Already imported: `DateTime` from luxon, `nowBahia`/`todayBahiaDate` from `@/lib/time`
- Needs import: `processDeviceGeofenceEvents` from `@/lib/tracking/process-device-geofence-events`
- Time utilities: `TIMEZONE` constant available from `@/lib/time` (value: `"America/Bahia"`)

---

## R4: Test Coverage Assessment

**Decision**: Extend existing test suite with targeted tests for the three fixes.

**Rationale**: The test file at `src/__tests__/tracking/process-device-geofence-events.test.ts` (843 lines) already covers 17 scenarios including deferred events, no-match retries, and duplicate handling. New tests should verify:
1. Deferred event gets `no_match` status (not left as `received`)
2. Batch query returns same results as single query
3. Shift creation triggers reprocessing of `no_match` events

**Key test patterns**: The existing tests use Supabase mocks with `vi.fn()` for each table operation. Follow the same pattern.
