# Implementation Plan: Tracking Inference Fixes

**Branch**: `051-tracking-inference-fixes` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/051-tracking-inference-fixes/spec.md`

## Summary

Fix six interrelated tracking inference issues: (1) decouple route lifecycle from GPS freshness so active routes never disappear due to stale GPS, (2) confidence-gate stop backfill to reduce false positives, (3) add logical stop grouping for repeated stops, (4) implement hybrid raw/snapped position policy for stop matching, (5) add segment-aware ETA fallback using stored OSRM distances, and (6) persist progress pointers on route runs for single source of truth. All changes are within the existing Next.js BFF + Supabase stack, primarily affecting tracking inference modules, route APIs, and database schema.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Supabase (self-hosted), Luxon, Zod, TanStack Query, Vitest
**Storage**: PostgreSQL via Supabase (self-hosted Docker)
**Testing**: Vitest (unit tests, jsdom environment)
**Target Platform**: Mobile-first web application (BFF layer)
**Project Type**: Web service (Next.js BFF + frontend)
**Performance Goals**: Route API response time must not degrade from current baseline
**Constraints**: All computed fields in BFF; no Supabase Edge Functions; America/Bahia timezone
**Scale/Scope**: Small fleet (~10 vans), low concurrency, real-time tracking pipeline

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Each fix is the minimum change for its problem. No speculative abstractions. Schema additions are additive (nullable columns). |
| II. Explicit Trade-offs | PASS | Trade-offs documented in spec: backward compatibility via `isRunning` kept temporarily; `pass_source`/`confidence` are additive, not replacing `status`. |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`. Conventional commits. |
| IV. Quality Gates | PASS | Existing 90 tests must pass. New tests required for each changed behavior before merge. |
| V. Stack Constraints | PASS | All changes within Next.js + Supabase stack. No Edge Functions. Computed fields remain in BFF. Luxon for timezone. Zod for validation. |
| Security Constraints | PASS | No new public endpoints. Admin health endpoint uses existing auth. Service role key stays server-only. |
| Timezone & Data | PASS | All time comparisons use Luxon with America/Bahia. Staleness thresholds computed in BFF. |

**Gate result: PASS** — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/051-tracking-inference-fixes/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── types/index.ts                              # TrackingStatus type, RouteProgress updates
├── lib/
│   ├── tracking/
│   │   ├── infer-stop-progress.ts              # Confidence-gated backfill, stop grouping, hybrid position
│   │   ├── run-status.ts                       # No changes (already correct)
│   │   ├── eta.ts                              # Segment-aware fallback tier
│   │   ├── tracker-health.ts                   # No changes (already exists)
│   │   └── time-factors.ts                     # No changes (reused by segment fallback)
│   └── validators/
│       └── schedule-entry.ts                   # Accept stop_group_id
├── app/api/
│   ├── routes/
│   │   ├── route.ts                            # trackingStatus, isRunning decoupling, read persisted progress
│   │   └── [routeId]/route.ts                  # Same changes as above
│   ├── tracking/
│   │   └── [vanId]/route.ts                    # Pass snapped coords to inference
│   ├── tracking-batch/
│   │   └── [vanId]/route.ts                    # Pass snapped coords to inference (same change)
│   ├── admin/vans/
│   │   ├── route.ts                            # Expose tracker health
│   │   └── [vanId]/route.ts                    # Expose tracker health
│   └── admin/routes/[routeId]/schedule/
│       ├── route.ts                            # Accept stop_group_id
│       └── [entryId]/route.ts                  # Accept stop_group_id
└── __tests__/tracking/
    ├── infer-stop-progress.test.ts             # New: confidence gating, stop grouping, hybrid position tests
    ├── eta.test.ts                             # New: segment-aware fallback tests
    └── routes-api.test.ts                      # New: API response shape (trackingStatus, isRunning, isTrackingFresh)

docs/
└── ETA-CONFIGURATION.md                        # Update to reflect segment-aware fallback and OSRM timeouts

supabase/migrations/
├── 00011_stop_confidence_metadata.sql          # pass_source, pass_confidence on route_run_stops
├── 00012_stop_group_id.sql                     # stop_group_id on schedule_entries
└── 00013_persist_progress_pointers.sql         # last_passed_stop_id, next_stop_id on route_runs
```

**Structure Decision**: All changes fit within the existing project structure. No new directories needed. Three additive migrations extend existing tables with nullable columns.
