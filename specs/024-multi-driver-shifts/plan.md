# Implementation Plan: Multi-Driver Shift Support

**Branch**: `024-multi-driver-shifts` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-multi-driver-shifts/spec.md`

## Summary

The current system assumes one driver per van with a single start/end lifecycle per day. This feature introduces **shift-based operations** (multiple start/end cycles per day by different drivers) and **multi-driver van assignments** (pre-assign multiple drivers to a van, no daily admin intervention). Key changes: new `route_shifts` table, new `van_drivers` join table, data migration from deprecated columns, and updated BFF + UI to handle shift lifecycle.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Next.js, TanStack Query, Zod, Luxon, shadcn/ui, Motion
**Storage**: PostgreSQL (Supabase self-hosted)
**Testing**: Vitest
**Target Platform**: Mobile-first web app
**Project Type**: Web service (BFF + frontend)
**Performance Goals**: Shift start/end in <10 seconds, public portal update within 30s polling
**Constraints**: All computed fields in BFF; Luxon forced to America/Bahia; no Supabase Edge Functions
**Scale/Scope**: ~5 vans, ~10 drivers, ~72 stops/route, 2-3 shifts/day typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | New tables (`van_drivers`, `route_shifts`) are the minimum needed. No speculative abstractions. |
| II. Explicit Trade-offs | PASS | Trade-off: full-replace semantics for driverIds (simpler than add/remove delta). Documented in research.md. |
| III. Branch & Merge | PASS | Feature branch `024-multi-driver-shifts` targets `dev`. |
| IV. Quality Gates | PASS | lint, tsc, build, vitest will be validated before PR. |
| V. Stack Constraints | PASS | Uses existing stack: Next.js Route Handlers, Supabase Postgres, Zod validation, Luxon timezone, shadcn/ui components. No Edge Functions. |
| Security | PASS | Service role key stays server-only. New tables have RLS enabled (service role access pattern). Driver authorization checked in BFF. |
| Timezone | PASS | All time operations use Luxon with America/Bahia. Shift timestamps are timestamptz. |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies. Data model uses established patterns.

## Project Structure

### Documentation (this feature)

```text
specs/024-multi-driver-shifts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api-contracts.md # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to change)

```text
supabase/
└── migrations/
    └── 00004_multi_driver_shifts.sql    # NEW: schema + data migration

src/
├── types/
│   └── index.ts                         # MODIFY: add RouteShift, VanDriver; update Van, RouteRun, RunStatus, DriverRoute, RouteProgress
├── lib/
│   └── tracking/
│       ├── run-status.ts                # MODIFY: derive from shifts + schedule window
│       └── eta.ts                       # MODIFY: accept startedAt from shift
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── route.ts                 # MODIFY: public list — shift-based status
│   │   │   └── [routeId]/
│   │   │       ├── route.ts             # MODIFY: public detail — shift-based status
│   │   │       ├── start/route.ts       # MODIFY: create shift instead of updating run
│   │   │       └── end/route.ts         # MODIFY: end shift instead of updating run
│   │   ├── driver/
│   │   │   └── routes/route.ts          # MODIFY: query van_drivers, include shifts
│   │   └── admin/
│   │       └── vans/
│   │           ├── route.ts             # MODIFY: return driverIds array
│   │           └── [vanId]/route.ts     # MODIFY: accept/persist driverIds array
│   └── driver/
│       └── page.tsx                     # MINOR: no changes expected (uses RouteCard)
└── components/
    ├── driver/
    │   └── route-card.tsx               # MODIFY: shift-aware start/end, shift history
    ├── admin/
    │   └── van-form.tsx                 # MODIFY: multi-driver select
    └── public/
        ├── hero-card.tsx                # MODIFY: handle idle/null progress
        └── route-status-badge.tsx       # MINOR: may need idle handling
```

**Structure Decision**: Existing Next.js App Router structure. All changes are modifications to existing files plus one new migration. No new directories or architectural patterns needed.

## Complexity Tracking

> No constitution violations to justify. All changes follow established patterns.
