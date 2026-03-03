# Research: Fix Stop Progress Backfill

## Decision 1: Closest-in-Time Matching Strategy

**Decision**: Group pending stops by coordinate key, then select the stop whose scheduled time is closest to `now` (smallest absolute difference) among eligible stops at that coordinate.

**Rationale**: The current code iterates pending stops in time-ascending order and uses a `matchedCoords` Set to skip duplicate coordinates — this always picks the earliest occurrence. Replacing this with a "closest to now" selection within each coordinate group correctly handles the CAAB-at-07:00/11:00 scenario.

**Alternatives considered**:
- *Pick the nearest future stop only*: Rejected because if the van arrives 5 minutes late (e.g., 11:05 for 11:00), the stop time is in the past and would be skipped. Absolute difference from `now` handles both early and late arrivals.
- *Remove matchedCoords entirely*: Rejected because we still need to ensure only one occurrence per coordinate per ping is matched.

## Decision 2: Backfill Approach

**Decision**: After all geofence matches in a single ping, collect the schedule_entry_ids of all pending stops with `time < latestMatchedStopTime` and update them in a single Supabase `.in()` query.

**Rationale**:
- Supabase client supports `.in("column", array)` for batch updates — one query instead of N individual updates.
- We already have all pending stops fetched in step 5, so filtering by time is a simple in-memory operation.
- This happens at the write path (not read), so data in DB is always correct.

**Alternatives considered**:
- *Backfill on read (computed)*: Rejected — DB would show stale data when queried directly; adds complexity to every consumer.
- *Individual UPDATE per backfilled stop*: Works but N+1 queries; `.in()` is a single query.
- *Database trigger*: Rejected — adds DB-level complexity; violates KISS for a single-function fix.

## Decision 3: Early Arrival Window Interaction

**Decision**: The early arrival window (30 min) continues to apply as a filter BEFORE closest-in-time selection. Only stops within the window are candidates for matching.

**Rationale**: The window prevents marking a 14:00 stop at 13:00. By filtering first, the closest-in-time selection only considers eligible stops, which is the correct behavior.

## Decision 4: Update Query Pattern for Backfill

**Decision**: Use Supabase `.in("schedule_entry_id", ids)` filter on the `.update()` call.

**Rationale**: PostgREST/Supabase does not support filtering on joined table columns in `.update()`, so we cannot do `.lt("schedule_entries.time", ...)`. Instead, we compute the IDs to backfill in application code (from the already-fetched pending stops array) and pass them via `.in()`.

**Alternatives considered**:
- *Raw SQL via Supabase RPC*: Works but introduces a new DB function; overkill for this.
- *Loop with individual updates*: Works but slower; `.in()` is a single roundtrip.

## Decision 5: Test Mock Extension

**Decision**: Extend the existing `createMockSupabase` to track `.in()` calls on `route_run_stops.update()`, capturing backfilled IDs separately from geofence-matched IDs.

**Rationale**: The current mock tracks updates via `mock._updates` array by intercepting `.eq("schedule_entry_id", value)`. The backfill path uses `.in("schedule_entry_id", [ids])` instead, so the mock needs a new handler for `.in()`.

## Call Site Analysis

**Single production caller**: `POST /api/tracking/[vanId]` → `inferStopProgress(supabase, vanId, lat, lng)`

The function's return type (`StopProgress`) and signature are unchanged. No API contract changes needed. The fix is purely internal to `inferStopProgress`.
