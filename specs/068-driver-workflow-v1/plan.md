# Implementation Plan: Driver Workflow V1

**Branch**: `068-driver-workflow-v1` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/068-driver-workflow-v1/spec.md`

## Summary

Transform the driver web area from a shift launcher into a live run console (P1), extend the stop progression model to support skip-with-reason and detour-mode with immutable audit (P2), and surface exception indicators to passengers on the public route pages (P4). P3 (deferred stops) is documented but out of scope for this branch.

**Technical approach**: Reuse the existing `resolveRouteProgress()` pipeline and public route detail endpoint for the active-route screen (P1). Extend `route_run_stops.status` CHECK constraint to include `skipped`, add exception metadata columns and a `route_run_events` audit table (P2 migration). Modify `enforceCanonicalPrefix()` and all downstream consumers to treat `skipped` as "resolved" for the contiguous-prefix rule. Add two new driver-only API endpoints (skip-stop, detour) and one new driver route detail endpoint. Extend public API responses with exception flags for P4.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 App Router)
**Primary Dependencies**: React 19, TanStack Query, MapLibre GL, Tailwind CSS 4, shadcn/ui, Zod, Luxon, motion
**Storage**: Supabase self-hosted (Postgres), service-role client for BFF
**Testing**: Vitest (unit tests)
**Target Platform**: Mobile web (Android Chrome, driver phones)
**Project Type**: Full-stack web application (Next.js BFF + Supabase backend)
**Performance Goals**: 2s active-route page load, 5s polling interval, <15s skip-stop action
**Constraints**: America/Bahia timezone, HH:mm for passenger-facing times, service-role key server-only, no Supabase Edge Functions
**Scale/Scope**: ~5-10 vans, ~10-20 stops per route, ~5-10 drivers, single-digit concurrent users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Skip-only V1, deferred excluded. No speculative abstractions. Reason codes are a simple enum, not a configurable admin system. |
| II. Explicit Trade-offs in PRs | PASS | Trade-offs documented: skip-only (not resequence), informational-only detour, predefined reasons. PR descriptions will reference these. |
| III. Branch & Merge Discipline | PASS | Feature branch `068-driver-workflow-v1` targets `dev`. Conventional commits. |
| IV. Quality Gates | PASS | lint + typecheck + build + tests must pass. New tests required for modified progression logic. |
| V. Stack Constraints | PASS | All work uses existing stack: Next.js Route Handlers, TanStack Query, Tailwind/shadcn, Zod, Luxon. No new dependencies. Computed fields in BFF. |
| Security Constraints | PASS | New endpoints use `requireAuth()` + driver role check + shift ownership. Service-role client for DB writes. No anon-key mutations. |
| Timezone & Data Consistency | PASS | All times in America/Bahia. Passenger-facing HH:mm. Audit timestamps in UTC (timestamptz). |

**Result: All gates PASS. No violations.**

## Project Structure

### Documentation (this feature)

```text
specs/068-driver-workflow-v1/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── driver-route-detail.md
│   ├── skip-stop.md
│   └── detour.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── driver/
│   │   ├── page.tsx                          # Existing route list (modified: link to active route)
│   │   ├── layout.tsx                        # Existing driver layout (unchanged)
│   │   └── routes/
│   │       └── [routeId]/
│   │           └── page.tsx                  # NEW: Active-route screen (P1)
│   ├── api/
│   │   ├── driver/
│   │   │   └── routes/
│   │   │       ├── route.ts                  # Existing (response extended with exception data)
│   │   │       └── [routeId]/
│   │   │           └── route.ts              # NEW: Driver route detail + tracker health
│   │   └── routes/
│   │       └── [routeId]/
│   │           ├── route.ts                  # Existing public detail (response extended)
│   │           ├── skip-stop/
│   │           │   └── route.ts              # NEW: Skip current next stop (P2)
│   │           └── detour/
│   │               └── route.ts              # NEW: Enter/exit detour (P2)
│   └── (public)/
│       └── routes/
│           └── [routeId]/
│               └── page.tsx                  # Existing (modified: exception indicators P4)
├── components/
│   ├── driver/
│   │   ├── route-card.tsx                    # Existing (modified: link to active route)
│   │   ├── active-route/                     # NEW: Active-route screen components (P1)
│   │   │   ├── next-stop-hero.tsx
│   │   │   ├── tracker-health.tsx
│   │   │   └── exception-drawer.tsx          # NEW: Skip/detour actions (P2)
│   │   └── route-map.tsx                     # NEW: Driver map (may share with public)
│   └── public/
│       └── schedule-timeline.tsx             # Existing (reused on driver page; modified: skipped stop styling P4)
├── lib/
│   ├── tracking/
│   │   ├── enforce-canonical-prefix.ts       # Modified: treat "skipped" as resolved
│   │   ├── persist-canonical-progress.ts     # Modified: skip over "skipped" stops
│   │   ├── resolve-route-progress.ts         # Modified: include exception data in response
│   │   ├── infer-stop-progress.ts            # Modified: backfill skips over "skipped"
│   │   ├── process-device-geofence-events.ts # Modified: head-of-line skips "skipped"
│   │   ├── eta.ts                            # Modified: ETA skips "skipped" stops
│   │   └── run-status.ts                     # Modified: all-skipped = completed logic
│   └── validators/
│       └── route.ts                          # Modified: add skip/detour validation schemas
├── types/
│   └── index.ts                              # Modified: extended types
└── tests/
    └── lib/tracking/                         # Modified + new test files

supabase/
└── migrations/
    └── 00020_stop_exceptions.sql             # NEW: schema changes for skip + detour + audit
```

**Structure Decision**: This feature extends the existing Next.js App Router structure. New pages go under `src/app/driver/routes/[routeId]/`. New API endpoints go under existing `src/app/api/` paths. New components are colocated in `src/components/driver/active-route/`. The migration adds to the existing `supabase/migrations/` sequence.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
