# Implementation Plan: Start Route

**Branch**: `022-start-route` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-start-route/spec.md`

## Summary

Add a "Start Route" feature that lets drivers explicitly start and end their route from the web app. Drivers authenticate with email/password (existing Supabase Auth, new "driver" role), are assigned to a van, and inherit the van's route(s). The system records `started_at`/`ended_at` timestamps on `route_runs`, uses `started_at` as the time floor for progress tracking and ETA computation, and exposes lifecycle states ("waiting to start", "in progress", "completed") on the public page. The Phase 1 time-aware filtering remains as a permanent fallback.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Next.js 15 (App Router), Supabase (@supabase/ssr, @supabase/supabase-js), TanStack Query, Zod, Luxon, Tailwind CSS, shadcn/ui, Motion
**Storage**: PostgreSQL via Supabase self-hosted
**Testing**: Vitest
**Target Platform**: Web (mobile-first, works in phone browsers)
**Project Type**: Web service (BFF + frontend, Next.js App Router)
**Performance Goals**: 30s polling interval, <10s driver start/end interaction (SC-001)
**Constraints**: America/Bahia timezone (Luxon), service role key server-only, no Supabase Edge Functions
**Scale/Scope**: MVP — small number of drivers (2-5), vans, routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Derived run status from 2 timestamp columns (no enum). Van-driver is a single column. No new abstractions — follows existing patterns. |
| II. Explicit Trade-offs | PASS | Will document in PR: keeping derived status vs. adding a status column. |
| III. Branch & Merge Discipline | PASS | Feature branch `022-start-route`, PR targets `dev`. |
| IV. Quality Gates | PASS | Must pass lint, typecheck, build, tests before merge. |
| V. Stack Constraints | PASS | All within existing stack. No Edge Functions. BFF computes derived fields. Luxon for timezone. |
| Security Constraints | PASS | Service role key server-only. Driver auth via session client (cookie-based). Driver endpoints validate van ownership. |
| Timezone | PASS | All timestamps in America/Bahia via Luxon. |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies, no Edge Functions, no client-side service role key usage.

## Project Structure

### Documentation (this feature)

```text
specs/022-start-route/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity changes
├── quickstart.md        # Phase 1: dev setup guide
├── contracts/
│   └── api-contracts.md # Phase 1: API contract definitions
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 00003_start_route.sql            # NEW: migration for driver_id, started_at, ended_at

src/
├── app/
│   ├── (public)/routes/[routeId]/
│   │   └── page.tsx                 # MODIFY: "waiting to start" + "completed" states
│   ├── admin/
│   │   ├── layout.tsx               # MODIFY: driver role redirect
│   │   ├── vans/
│   │   │   └── [vanId]/page.tsx     # MODIFY: driver assignment UI
│   │   └── users/
│   │       └── new/page.tsx         # MODIFY: "driver" role in form (via user-form.tsx)
│   ├── driver/
│   │   ├── layout.tsx               # NEW: minimal mobile-focused driver layout
│   │   └── page.tsx                 # NEW: driver dashboard with start/end controls
│   └── api/
│       ├── routes/[routeId]/
│       │   ├── route.ts             # MODIFY: include runStatus in progress
│       │   ├── start/
│       │   │   └── route.ts         # NEW: POST start route
│       │   └── end/
│       │       └── route.ts         # NEW: POST end route
│       ├── driver/
│       │   └── routes/
│       │       └── route.ts         # NEW: GET driver's routes
│       └── admin/
│           ├── vans/[vanId]/
│           │   └── route.ts         # MODIFY: accept driver_id
│           └── users/
│               └── route.ts         # MODIFY: accept "driver" role
├── components/
│   ├── driver/
│   │   └── route-card.tsx           # NEW: driver route card with start/end buttons
│   ├── admin/
│   │   ├── van-form.tsx             # MODIFY: driver assignment select
│   │   ├── user-form.tsx            # MODIFY: add "driver" role option
│   │   └── sidebar-nav.tsx          # MODIFY: hide nav items from drivers (if they hit /admin)
│   └── public/
│       ├── hero-card.tsx            # MODIFY: "waiting to start" / "completed" states
│       └── schedule-timeline.tsx    # MODIFY: "waiting to start" state handling
├── lib/
│   ├── api/
│   │   └── auth.ts                  # MODIFY: extend role type to include "driver"
│   ├── tracking/
│   │   ├── eta.ts                   # MODIFY: started_at-aware filtering
│   │   └── infer-stop-progress.ts   # MODIFY: started_at-aware filtering
│   └── validators/
│       ├── user.ts                  # MODIFY: add "driver" to role enum
│       └── van.ts                   # MODIFY: add driver_id field (if exists, or update inline)
├── types/
│   └── index.ts                     # MODIFY: updated types
└── middleware.ts                     # MODIFY: protect /driver/*, redirect drivers

tests/
└── (new tests for start/end logic, auth, ETA with started_at)
```

**Structure Decision**: Follows the existing Next.js App Router structure. New `/driver` route group with its own layout (separate from `/admin`) because the driver experience is fundamentally different (single-purpose mobile view vs. admin CRUD dashboard). API endpoints follow existing patterns under `/api/routes/[routeId]/` and a new `/api/driver/` namespace.

## Complexity Tracking

> No constitution violations. All changes follow existing patterns with minimal new abstractions.

| Decision | Justification |
|----------|---------------|
| Separate `/driver` route group (not under `/admin`) | Driver UX is mobile-focused single-purpose view; admin is desktop CRUD dashboard. Merging would require complex conditional rendering. KISS. |
| Derived run status (no `status` column) | Two nullable timestamps + derivation logic vs. a status enum that could fall out of sync. KISS + DRY. |
| `driver_id` on `vans` (not a junction table) | 1:1 relationship, single nullable column. No need for a table with one FK pair. YAGNI. |
