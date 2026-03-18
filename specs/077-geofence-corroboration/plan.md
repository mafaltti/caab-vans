# Implementation Plan: GPS Corroboration Gate

**Branch**: `077-geofence-corroboration` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/077-geofence-corroboration/spec.md`

## Summary

Device geofence events currently mark stops as "passed" immediately upon receipt, even when GPS shows the van is 120m away on a parallel road. This feature adds a corroboration gate: the event enters an `"awaiting_corroboration"` state and is only confirmed when a subsequent GPS ping shows the van within 50m (`geofence_radius_m`). If GPS goes stale (no ping within 30s of event receipt), the system falls back to trusting the device geofence alone. The change is entirely server-side — no tracker app modifications needed.

## Technical Context

**Language/Version**: TypeScript ~5 (Next.js 16 App Router)
**Primary Dependencies**: Supabase JS client, Luxon, Zod, haversine utility
**Storage**: PostgreSQL via Supabase (self-hosted)
**Testing**: Vitest with Proxy-based Supabase mock factories
**Target Platform**: Linux VPS (server-side only; no device changes)
**Project Type**: Web service (BFF layer)
**Performance Goals**: Request-driven evaluation on each GPS ping (~5s cadence); no background processes
**Constraints**: Must not regress stop detection during GPS blackouts; <60s commuter-facing delay
**Scale/Scope**: ~10 active vans; single-digit concurrent tracking requests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | One new function + one migration. Reuses existing event status column, deferred machinery, and retry mechanism. No new tables or abstractions. |
| II. Explicit Trade-offs | PASS | Trade-off: 15-30s delay in stop confirmation vs. eliminating false positives. Documented in spec US4. |
| III. Branch & Merge Discipline | PASS | Feature branch `077-geofence-corroboration`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be verified. |
| V. Stack Constraints | PASS | Uses existing stack: TypeScript, Supabase, Luxon, Vitest. No new dependencies. |
| Security Constraints | PASS | No new public endpoints. Uses existing service-role-only tracking path. |
| Timezone & Data Consistency | PASS | Staleness uses server-side timestamps (UTC); no timezone conversion needed. |

**Post-Phase 1 re-check**: PASS — No violations introduced. Single new file (`evaluate-pending-corroborations.ts`), single migration, minimal diff to existing files.

## Project Structure

### Documentation (this feature)

```text
specs/077-geofence-corroboration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md             # Created by /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── lib/tracking/
│   ├── process-device-geofence-events.ts   # Modified: awaiting_corroboration instead of immediate matched
│   ├── evaluate-pending-corroborations.ts   # NEW: corroboration + staleness evaluation
│   ├── persist-canonical-progress.ts        # Unchanged (called by new function)
│   └── enforce-canonical-prefix.ts          # Unchanged
├── app/api/tracking/[vanId]/
│   └── route.ts                             # Modified: call evaluatePendingCorroborations after ping upsert

src/__tests__/tracking/
├── process-device-geofence-events.test.ts   # Modified: update for awaiting_corroboration
├── evaluate-pending-corroborations.test.ts  # NEW: corroboration + staleness tests
└── append-geofence-response.test.ts         # Modified: awaiting events excluded

supabase/migrations/
└── 00022_awaiting_corroboration_status.sql  # NEW: add status value to CHECK constraint
```

**Structure Decision**: Server-side only change within the existing `src/lib/tracking/` module. One new file for the corroboration evaluation function. No new directories or architectural changes.

## Complexity Tracking

No constitution violations to justify.
