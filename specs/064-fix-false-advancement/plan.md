# Implementation Plan: Prevent False Stop Advancement

**Branch**: `064-fix-false-advancement` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/064-fix-false-advancement/spec.md`

## Summary

Device geofence events on dense downtown segments can fire out of stop-sequence order, causing false stop advancement via the gap-1 backfill heuristic. This fix adds a contiguous-prefix guard: a geofence event may only mark a stop as passed when it is the first pending stop (head-of-line). Non-adjacent events stay in `received` status and are retried on subsequent pings. A defense-in-depth check in the ack response ensures `processedEventIds` only includes events whose stops are in the contiguous passed prefix.

## Technical Context

**Language/Version**: TypeScript ~5.x (Next.js 16 App Router)
**Primary Dependencies**: Supabase JS client (server-side, service-role), Luxon
**Storage**: PostgreSQL via Supabase (tables: `tracking_geofence_events`, `route_run_stops`, `schedule_entries`)
**Testing**: Vitest (jsdom env, globals enabled)
**Target Platform**: Linux server (Next.js process behind Caddy)
**Project Type**: Web service (BFF + API route handlers)
**Performance Goals**: No new queries in hot path; `matchedIndex` check is O(n) on pending stops (typically <30)
**Constraints**: No schema changes, no mobile tracker contract changes
**Scale/Scope**: Single-van single-run processing per ping; changes affect 2 source files + 2 test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Removes backfill complexity. Reuses existing `enforceCanonicalPrefix` (3rd usage = DRY threshold met). No new abstractions. |
| II. Explicit Trade-offs in PRs | PASS | PR will document: backfill removed, `received` status overloaded (tradeoff vs. schema change). |
| III. Branch & Merge Discipline | PASS | Feature branch `064-fix-false-advancement` targeting `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests all required. Test plan covers 12+ test cases. |
| V. Stack Constraints | PASS | TypeScript, Next.js Route Handlers, Supabase client, Vitest. No new deps. |
| Security | PASS | No auth/RLS changes. Service-role usage unchanged. |
| Timezone | N/A | No time display changes. Internal timestamps only. |

**Post-design re-check**: PASS — no new violations introduced. `enforceCanonicalPrefix` reuse in route.ts is the 3rd call site, meeting the DRY threshold.

## Project Structure

### Documentation (this feature)

```text
specs/064-fix-false-advancement/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (affected files)

```text
src/
├── lib/tracking/
│   ├── process-device-geofence-events.ts   # MODIFY: core guard + backfill removal
│   └── enforce-canonical-prefix.ts         # READ ONLY: reused in route.ts
├── app/api/tracking/[vanId]/
│   └── route.ts                            # MODIFY: defense-in-depth ack
└── __tests__/tracking/
    ├── process-device-geofence-events.test.ts  # MODIFY: replace backfill test, add 3 new
    └── append-geofence-response.test.ts        # NEW: ack logic tests
```

**Structure Decision**: All changes fit within existing directory structure. No new directories needed. One new test file for the extracted ack logic.

## Design Decisions

### D1: Contiguous-Prefix Guard in `processOneEvent`

**What**: After closest-in-time matching and confidence computation, check if the matched stop is the first pending stop (`matchedIndex === 0`). Only proceed with mark-as-passed and ledger update when true.

**Where**: `process-device-geofence-events.ts`, insert between line 253 (end of confidence check) and line 256 (start of mark-as-passed).

**Behavior when `matchedIndex > 0`**:
- Do NOT update `route_run_stops`
- Do NOT update `tracking_geofence_events` to `matched`
- Leave event as `received` (retryable)
- Log structured warning with context
- Return without adding to `tentativeMatchIds`

### D2: Backfill Block Removal

**What**: Delete lines 275-299 entirely (the "Conservative gap-1 backfill" block).

**Why**: FR-002 explicitly prohibits backfill. The contiguous-prefix guard (D1) makes backfill unnecessary — stops can only advance in order.

### D3: Defense-in-Depth Ack in `appendGeofenceResponse`

**What**: After querying matched events and their stop statuses, load all stops for each involved run, compute `enforceCanonicalPrefix`, and filter `processedEventIds` to only include events whose `matched_schedule_entry_id` is in `contiguousPassedIds`.

**Where**: `route.ts`, within `appendGeofenceResponse` (lines 238-281), after the existing passed-stop verification query (line 260-266).

**Additional query**: One `SELECT` on `route_run_stops` per distinct `matched_run_id` (typically 1 per ping) to get all stops with `stop_sequence` for the prefix computation.

### D4: Test File for Ack Logic

**What**: Create `append-geofence-response.test.ts` with unit tests that mock Supabase and verify the ack filtering logic. Tests extracted `appendGeofenceResponse` directly — the function is already a named inner function that can be extracted to a separate module if needed, but for this fix, testing via mock injection is sufficient.

**3 test cases**:
1. Non-contiguous matched stop → `processedEventIds: []`
2. Contiguous matched stop → includes event ID
3. Corrupted non-contiguous passed rows → excluded from ack

## Complexity Tracking

No constitution violations to justify. All changes follow existing patterns.
