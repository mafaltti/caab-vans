# Implementation Plan: Schedule Time Split

**Branch**: `063-schedule-time-split` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/063-schedule-time-split/spec.md`

## Summary

Refactor `schedule_entries` from a single overloaded `time` column to three purpose-specific columns: `arrival_time`, `departure_time`, and `stop_sequence`. This decouples stop ordering from clock values and enables distinct arrival/departure semantics across the tracking core, API responses, and UI. The migration uses a 4-phase approach with a bidirectional dual-write trigger for zero-downtime backward compatibility.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 App Router)
**Primary Dependencies**: Supabase (Postgres), Zod, Luxon, TanStack Query
**Storage**: PostgreSQL via Supabase self-hosted (table: `schedule_entries`)
**Testing**: Vitest (unit tests, ~18 test files potentially affected)
**Target Platform**: Web (server + client), Android tracker app (unaffected)
**Project Type**: Web service (BFF + public/admin/driver UI)
**Performance Goals**: No performance regression — this is a data model refactoring, not a new feature
**Constraints**: Zero-downtime migration; backward compatibility during transition; all quality gates must pass per phase
**Scale/Scope**: ~30 source files to modify across 4 phases; ~18 test files to update fixtures

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Dual-write trigger is the minimum mechanism for safe migration. No speculative abstractions added. |
| II. Explicit Trade-offs in PRs | PASS | Each phase PR will document which fields are being migrated and why. |
| III. Branch & Merge Discipline | PASS | Working on feature branch `063-schedule-time-split`, PRs target `dev`. |
| IV. Quality Gates | PASS | Each phase must pass lint, typecheck, build, tests before merge. |
| V. Stack Constraints | PASS | Uses existing stack: Postgres, Zod, Luxon, Next.js Route Handlers. No new dependencies. |
| Security Constraints | PASS | No new public surfaces. Reorder endpoint is admin-only (existing auth pattern). |
| Timezone & Data Consistency | PASS | Times remain HH:mm in America/Bahia. `formatTimeString()` pattern unchanged. |

**Post-Phase 1 re-check**: All gates still pass. No new abstractions, dependencies, or exposed surfaces introduced in the data model or contract design.

## Project Structure

### Documentation (this feature)

```text
specs/063-schedule-time-split/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── schedule-api.md  # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
supabase/migrations/
├── 00016_schedule_time_split.sql        # Phase 1: add columns + trigger
└── 00017_drop_legacy_time.sql           # Phase 4: remove time column

src/
├── types/index.ts                       # ScheduleEntry, NextStop, RouteDetail, TimelineStop
├── lib/
│   ├── validators/schedule-entry.ts     # Zod schemas (create, update, reorder)
│   ├── time.ts                          # isWithinScheduleWindow, getNextStop
│   └── tracking/
│       ├── eta.ts                       # ETA computation (15 time refs)
│       ├── infer-stop-progress.ts       # Geofence matching (10 time refs)
│       ├── process-device-geofence-events.ts  # Device geofence (5 time refs)
│       ├── resolve-route-progress.ts    # Progress resolution (6 time refs)
│       ├── suggest-start-stop.ts        # Cold-start suggestion (9 time refs)
│       └── seed-route-run-stops.ts      # Run stop seeding (2 time refs)
├── app/
│   ├── api/
│   │   ├── routes/route.ts              # Public route list
│   │   ├── routes/[routeId]/route.ts    # Public route detail
│   │   ├── routes/[routeId]/start/route.ts
│   │   ├── routes/[routeId]/confirm-start-stop/route.ts
│   │   ├── admin/routes/[routeId]/schedule/route.ts        # Admin CRUD
│   │   ├── admin/routes/[routeId]/schedule/[entryId]/route.ts
│   │   ├── admin/routes/[routeId]/schedule/reorder/route.ts  # NEW
│   │   ├── driver/routes/route.ts
│   │   └── tracker-config/[vanId]/route.ts
│   └── (public)/routes/[routeId]/page.tsx   # Identity match fix
├── components/
│   ├── admin/schedule-editor.tsx         # Two time inputs + reorder
│   ├── public/
│   │   ├── schedule-timeline.tsx         # Time range display
│   │   ├── hero-card.tsx                 # arrivalTime beside ETA
│   │   ├── route-card.tsx                # arrivalTime display
│   │   └── route-detail-peek.tsx         # Parent passes arrivalTime
│   └── driver/route-card.tsx             # Both times when different

scripts/
├── seed-schedule.ts                      # New fields in seed data
├── simulate-tracking.ts                  # Sort by stopSequence
├── precompute-stop-distances.ts          # ORDER BY stop_sequence
└── reconcile-orphaned-shifts.ts          # Use arrivalTime for max
```

**Structure Decision**: Existing Next.js App Router structure. No new directories except `schedule/reorder/` for the new endpoint. All changes are modifications to existing files plus two new migration files and one new API route.

## Complexity Tracking

No constitution violations requiring justification. The dual-write trigger is necessary complexity for zero-downtime migration (not speculative). It is removed in Phase 4.
