# Implementation Plan: Tracking Simplification

**Branch**: `065-tracking-simplification` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/065-tracking-simplification/spec.md`

## Summary

Simplify the tracking system around one rule: device geofence events and explicit manual confirmation are the only writers of stop progress. GPS pings remain for live position, ETA, health, and buffering but no longer mutate `route_run_stops` or `route_runs`. This involves removing `inferStopProgress()` calls from GPS ingestion, wiring device geofence processing to persist progress pointers, extracting a shared canonical-prefix helper, seeding stops at shift start, collapsing the multi-mode progress resolver, and fixing mobile config resync. No schema migration required.

## Technical Context

**Language/Version**: TypeScript ~5 (Next.js 16, Expo SDK 55)
**Primary Dependencies**: Next.js App Router (BFF), Supabase JS client, Expo Location, Zod, Luxon
**Storage**: PostgreSQL via Supabase (self-hosted)
**Testing**: Vitest (unit tests; no e2e suite)
**Target Platform**: Linux VPS (server), Android (tracker app)
**Project Type**: Web service + mobile tracker app (two runtimes, one repo)
**Performance Goals**: Geofence event processing < 500ms; ping ingestion latency unchanged
**Constraints**: No schema migrations; existing tables/columns sufficient; offline-capable tracker
**Scale/Scope**: ~10 vans, ~10–15 stops per route, ~1 ping/5s per van

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Net deletion of code (remove GPS inference, backfill, 3-mode branching). One new helper extracted from 2 existing implementations (DRY at 2 occurrences justified because logic is identical and will gain a 3rd caller). |
| II. Explicit Trade-offs | PASS | PR will document: removed GPS inference vs. added pointer-persist in geofence handler. |
| III. Branch & Merge | PASS | Feature branch targets `dev`. No direct pushes. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests must pass. Existing test suites updated. |
| V. Stack Constraints | PASS | No new dependencies. Same stack (Next.js, Supabase, Expo, Zod, Luxon). |
| Security | PASS | No auth changes. x-ingestion-token, driver role, service-role-key boundaries unchanged. |
| Timezone | PASS | No timezone changes. Luxon + America/Bahia unchanged. |

**Post-Phase-1 Re-check**: The shared helper extraction is at 2 occurrences (infer-stop-progress + confirm-start-stop) gaining a 3rd (device-geofence). This satisfies the DRY >= 3 rule once the feature lands. No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/065-tracking-simplification/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
src/app/api/
├── tracking/[vanId]/route.ts              # Remove inferStopProgress call + deferred retry
├── tracking-batch/[vanId]/route.ts        # Remove inferStopProgress loop
├── routes/[routeId]/
│   ├── start/route.ts                     # Add stop seeding + next_stop_id init
│   └── confirm-start-stop/route.ts        # Refactor to use shared helper
└── tracker-config/[vanId]/route.ts        # Radius aggregation + clamping

src/lib/tracking/
├── persist-canonical-progress.ts          # NEW: shared helper (extract from 2 existing)
├── process-device-geofence-events.ts      # Wire shared helper after marking stop
├── resolve-route-progress.ts              # Remove TRACKING_PROGRESS_SOURCE branching
├── infer-stop-progress.ts                 # Becomes dead code (callers removed)
├── seed-route-run-stops.ts                # Unchanged (already exists)
└── enforce-canonical-prefix.ts            # Unchanged (already exists)

apps/van-tracker/src/
├── api/client.ts                          # Chain registerGeofencesFromCache after re-fetch
└── location/tracking.ts                   # Export registerGeofencesFromCache (already exists)

src/__tests__/tracking/
├── process-device-geofence-events.test.ts # Add pointer-persist assertions
├── resolve-route-progress.test.ts         # Remove mode-specific tests
├── resolve-route-progress-modes.test.ts   # DELETE (3-mode tests obsolete)
├── infer-stop-progress.test.ts            # Retain as regression; mark callers removed
└── persist-canonical-progress.test.ts     # NEW: unit tests for shared helper
```

**Structure Decision**: Existing Next.js + Expo monorepo layout. One new file (`persist-canonical-progress.ts`), one deleted test file (`resolve-route-progress-modes.test.ts`). All other changes are modifications to existing files.
