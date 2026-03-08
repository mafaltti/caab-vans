# Research: Atomic Van Position Update

**Date**: 2026-03-07
**Feature**: 047-fix-van-position-atomic

## Decision 1: New Column vs. Column Rename

**Decision**: Add new column `last_gps_fix_at` alongside existing `location_updated_at`.

**Rationale**:
- `location_updated_at` serves a valid admin/audit purpose ("when was this row last synced") and is used in the admin UI.
- Renaming would break the semantic meaning for admin consumers.
- A new column clearly separates "GPS device time" from "server receipt time."
- Backfill populates the new column from historical `van_location_pings.device_ts`.

**Alternatives considered**:
- **Rename column**: Simpler migration but loses admin audit capability. Rejected because FR-004 requires preserving server receipt time.
- **Two new columns (replace + rename)**: Over-engineering. The existing name `location_updated_at` is fine for its audit purpose.

## Decision 2: Atomic Update Mechanism

**Decision**: PostgreSQL RPC function (`update_van_position`) with `WHERE` guard.

**Rationale**:
- Single SQL `UPDATE ... WHERE last_gps_fix_at IS NULL OR p_device_ts > last_gps_fix_at` is atomic — no interleaving possible.
- Eliminates the current `previousLatest` SELECT query entirely (net -1 DB call per ping).
- Returns `FOUND` boolean to caller, enabling conditional `inferStopProgress` execution.
- Called via `supabase.rpc("update_van_position", {...})` — standard Supabase pattern.

**Alternatives considered**:
- **Optimistic locking (version column)**: More complex, requires retry logic. Rejected — the `WHERE` guard achieves the same goal without retries.
- **SELECT FOR UPDATE**: Requires explicit transaction wrapping, which Supabase JS client doesn't support natively per-request. Rejected.
- **Database trigger**: Would fire on every UPDATE regardless of source. Too broad and harder to debug. Rejected.

## Decision 3: Consumer Migration Strategy

**Decision**: All freshness consumers switch to `last_gps_fix_at`. API response field renamed to `lastGpsFixAt`.

**Rationale**:
- Clean break — no ambiguity about which field means what.
- The `isLocationFresh()` function signature doesn't change (still takes `DateTime`); only callers pass the new field.
- VanPosition interface in `eta.ts` renames `locationUpdatedAt` to `lastGpsFixAt` for clarity.
- Admin APIs can optionally continue returning `locationUpdatedAt` from `location_updated_at` for audit display.

**Alternatives considered**:
- **Keep same API field name**: Avoids frontend changes but creates confusion about what the field actually represents. Rejected for clarity.
- **Return both fields in API**: Over-engineering for public API; admin API may return both if needed.

## Decision 4: Backfill Strategy

**Decision**: Backfill in the same migration using a SQL subquery from `van_location_pings`.

**Rationale**:
- One-shot backfill: `UPDATE vans SET last_gps_fix_at = (SELECT MAX(device_ts) FROM van_location_pings WHERE van_id = vans.id)`.
- Runs within the migration transaction — atomic and idempotent.
- After backfill, only truly new vans (never pinged) will have NULL.

**Alternatives considered**:
- **Separate backfill script**: Adds operational complexity. Rejected — SQL subquery in migration is simpler and atomic.
- **Backfill lazily on next ping**: Leaves vans with incorrect NULL until they ping again; freshness consumers would see "stale" incorrectly. Rejected per clarification session.

## Decision 5: `previousLatest` Query Elimination

**Decision**: Remove the `previousLatest` SELECT query from both ingest routes.

**Rationale**:
- The RPC function's `WHERE` clause handles the "is newest" check atomically.
- The `previousLatest` query was only needed because the UPDATE had no timestamp guard.
- Removing it saves one DB round-trip per ping (latency improvement).
- The RPC's boolean return replaces `isNewest` for gating `inferStopProgress`.

**Alternatives considered**:
- **Keep query for logging**: The sequence gap detection (`console.warn`) uses `previousLatest`. However, Finding #4 (doc 0073) identifies this as dead code. For this PR, we keep gap detection using the ping table query that already exists for OSRM trajectory building. If Finding #4 is implemented later, gap detection is removed entirely.

## Decision 6: Batch Ingest — Single vs. Per-Ping RPC Call

**Decision**: Single RPC call with the newest ping's data after all pings are upserted.

**Rationale**:
- Batch endpoint already identifies `newestUpserted` by sorting and tracking.
- Only one position update per batch is needed (the newest ping).
- Avoids N RPC calls for N pings in a batch.

**Alternatives considered**:
- **Per-ping RPC call in loop**: Correct but wasteful — N-1 calls would be no-ops. Rejected.
