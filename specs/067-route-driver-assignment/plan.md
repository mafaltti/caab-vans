# Implementation Plan: Route-Based Driver Assignment

**Branch**: `067-route-driver-assignment` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/067-route-driver-assignment/spec.md`

## Summary

Refactor driver assignment from van-centric (`van_drivers`) to route-centric (`route_drivers`). Add a new junction table with data migration, move admin CRUD to route APIs, swap authorization queries in driver-facing endpoints, move the driver multi-select UI from van forms to route forms, and add a lightweight `GET /api/admin/drivers` endpoint for admin-level access. No runtime fallback to `van_drivers`.

## Technical Context

**Language/Version**: TypeScript ~5, Next.js 16 (App Router), React 19
**Primary Dependencies**: Zod (validation), Supabase JS (DB client), Tailwind CSS + shadcn/ui (UI)
**Storage**: PostgreSQL via self-hosted Supabase
**Testing**: Vitest (unit tests)
**Target Platform**: Web (server-rendered + client components)
**Project Type**: Web application (Next.js fullstack)
**Performance Goals**: No regression — shift start/end within current latency
**Constraints**: Atomic cutover (no fallback to `van_drivers`); `van_drivers` kept physically but unused
**Scale/Scope**: ~13 files changed (2 new, 11 modified), 1 migration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | `route_drivers` mirrors `van_drivers` structure — minimum new schema. No new abstractions; reuses existing patterns (full-replace, checkbox list, Zod validation). |
| II. Explicit Trade-offs in PRs | PASS | PR will document: duplication of migration pattern kept simple vs. shared migration helper; driver validation reused from van PUT logic. |
| III. Branch & Merge Discipline | PASS | Feature branch `067-route-driver-assignment` targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be verified before PR. |
| V. Stack Constraints | PASS | Uses Next.js Route Handlers, Zod, Supabase, Tailwind/shadcn — no new technologies. |
| Security Constraints | PASS | Service role key stays server-only; new `GET /api/admin/drivers` uses `requireRole("admin")`. |
| Timezone & Data Consistency | N/A | No date/time changes in this feature. |

## Project Structure

### Documentation (this feature)

```text
specs/067-route-driver-assignment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api-contracts.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
supabase/migrations/
└── 00018_route_drivers.sql              # NEW — table + backfill

src/app/api/admin/
├── drivers/route.ts                     # NEW — GET /api/admin/drivers
├── routes/route.ts                      # MOD — GET adds driverIds, POST accepts driverIds
├── routes/[routeId]/route.ts            # MOD — PUT accepts driverIds
├── vans/route.ts                        # MOD — GET removes driverIds
└── vans/[vanId]/route.ts                # MOD — PUT removes driverIds handling

src/app/api/driver/
└── routes/route.ts                      # MOD — query route_drivers instead of van_drivers

src/app/api/routes/[routeId]/
└── start/route.ts                       # MOD — check route_drivers instead of van_drivers

src/components/admin/
├── route-form.tsx                       # MOD — add driver multi-select
└── van-form.tsx                         # MOD — remove driver selection

src/app/admin/
├── routes/new/page.tsx                  # MOD — pass driverIds to RouteForm
├── routes/[routeId]/page.tsx            # MOD — pass driverIds to RouteForm
└── vans/[vanId]/page.tsx                # MOD — remove showDriverSelect

src/lib/validators/route.ts              # MOD — add driverIds to schemas
src/types/index.ts                       # MOD — add RouteDriver type

__tests__/                               # NEW — test files for migration, APIs, auth
```

**Structure Decision**: All changes fit within the existing Next.js App Router layout. No new directories except `src/app/api/admin/drivers/` for the new endpoint and test files.
