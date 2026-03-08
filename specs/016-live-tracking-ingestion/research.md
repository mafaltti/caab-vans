# Research: Live Tracking Ingestion

## R-001: API Route Pattern

**Decision**: Follow existing `src/app/api/ingest/[vanId]/route.ts` pattern exactly.

**Rationale**: The codebase already has a working ingestion endpoint with the same auth model (x-ingestion-token header), rate limiting, Zod validation, and Supabase service client usage. Replicating this pattern minimizes cognitive load and ensures consistency.

**Alternatives considered**:
- Middleware-based auth: Rejected — existing endpoints do inline token check, and this is only the 2nd ingestion endpoint.
- Separate auth module: Rejected — only 2 endpoints use token auth (YAGNI, <3 repetitions per DRY rule).

## R-002: Zod Version & Import

**Decision**: Use `zod/v4` import path (e.g., `import { z } from "zod/v4"`).

**Rationale**: All existing validators use this import path. The project uses `zod@4.x`.

**Alternatives considered**:
- `zod` default import: Would work but inconsistent with existing code.

## R-003: Timestamp Handling

**Decision**: Convert `ts` (Unix milliseconds) to ISO timestamptz. Cap future timestamps >24h ahead to `now()`.

**Rationale**: The live-tracking-spec defines this behavior. Luxon's `DateTime.fromMillis()` handles the conversion. Using `now()` as fallback for far-future timestamps is safe — the device timestamp is diagnostic, not the source of truth for ordering (that's `received_at`).

**Alternatives considered**:
- Reject future timestamps entirely: Too strict — minor clock skew is common on Android.
- Use server time always: Loses diagnostic value of device timestamps for debugging gaps.

## R-004: Database Migration Naming

**Decision**: File named `supabase/migrations/00002_live_tracking.sql`.

**Rationale**: Follows the existing naming convention (`00001_initial_schema.sql`). Sequential numbering ensures deterministic ordering.

**Alternatives considered**:
- Timestamp-based naming (e.g., `20260301_live_tracking.sql`): Inconsistent with existing convention.

## R-005: Rate Limiter Configuration

**Decision**: 25 requests per 60-second window, keyed by vanId.

**Rationale**: Per the live-tracking-spec — accommodates 3s client interval (~20 req/min) plus headroom for offline buffer flushes (~25% margin).

**Alternatives considered**:
- Per-device rate limiting: Unnecessary — one device per van in practice.
- Per-IP rate limiting: Ineffective — mobile IPs change frequently.

## R-006: Response Format

**Decision**: Return `{ received: true, ts: Date.now() }` on success (HTTP 200).

**Rationale**: Matches the API contract defined in the live-tracking-spec. The server timestamp helps the client detect clock drift.

**Alternatives considered**:
- Return 201: Technically more correct for "created", but the spec says 200 and the client expects it.
- Return stored ping ID: Unnecessary — client doesn't need it.

## R-007: RLS Strategy

**Decision**: Enable RLS on `van_location_pings`, `route_runs`, `route_run_stops` with no anon policies.

**Rationale**: Tracking data is sensitive (location history). All access goes through the BFF using the service role key, which bypasses RLS. No direct client access to tracking tables.

**Alternatives considered**:
- Anon read policies: Rejected — location ping history should not be publicly queryable.

## R-008: Testing Strategy

**Decision**: No tests in this phase. Testing infrastructure exists (vitest configured) but this feature is a database migration + a straightforward endpoint following an established pattern.

**Rationale**: The spec's Phase 2 (inference + ETA) explicitly includes unit tests. This phase is integration-heavy (DB writes, HTTP flow) with minimal domain logic. Manual testing via HTTP requests is sufficient for V1. Per YAGNI, tests will be added when testable domain logic arrives in Phase 2.

**Alternatives considered**:
- Unit tests for the Zod schema: Low value — schema is declarative, validated by Zod itself.
- Integration tests: Would require DB setup — better suited for Phase 2 when there's actual logic to test.

## R-009: Existing Type Extensions

**Decision**: Extend the `Van` and `ScheduleEntry` types in `src/types/index.ts` to include the new columns.

**Rationale**: Types are manually maintained (no generated Supabase types). Adding the new fields keeps the types in sync with the migration.

**Alternatives considered**:
- Separate tracking types file: Rejected — the fields are on existing entities, not new types.
- Generated types: Not currently used; adopting Supabase codegen is a separate concern.
