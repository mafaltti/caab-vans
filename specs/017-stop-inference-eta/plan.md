# Implementation Plan: Stop Inference, ETA Computation & Tracking UI

**Branch**: `017-stop-inference-eta` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-stop-inference-eta/spec.md`

## Summary

Add stop inference (proximity-based geofence detection), schedule-shifted ETA computation, and tracking progress to the public API and UI. The tracking endpoint already stores pings — this feature adds a best-effort inference side effect that detects when vans pass stops, computes ETA, and surfaces progress through existing API endpoints and UI components. All new tracking logic lives in `src/lib/tracking/` as pure/testable modules. The admin schedule editor gains optional lat/lng fields. The public UI gains ETA display and inference-based stop progress.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Next.js 16 (App Router), React 19, Zod v4, Luxon 3, TanStack Query 5, Tailwind CSS 4, shadcn/ui, Motion 12
**Storage**: Supabase self-hosted PostgreSQL (service role client via `@supabase/supabase-js`)
**Testing**: Vitest 4 with jsdom environment, `@` path alias configured
**Target Platform**: Web (mobile-first) — Next.js on Node.js server
**Project Type**: Web application (frontend + BFF)
**Performance Goals**: Inference adds minimal overhead to ping ingestion (~2-3 extra DB queries per ping, best-effort)
**Constraints**: No Supabase Edge Functions; service role key server-only; `America/Bahia` timezone
**Scale/Scope**: ~1,200 pings/hour per van; small fleet (< 10 vans); single-instance Node.js

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Haversine, inference, ETA are each a single-purpose module. No speculative abstractions. V1 uses simple proximity (no hysteresis/dwell). |
| II. Explicit Trade-offs in PRs | **PASS** | PR will document: "linear ETA shift chosen over rolling-average for simplicity; single-ping geofence chosen over dwell timer" |
| III. Branch & Merge Discipline | **PASS** | Feature branch `017-stop-inference-eta` targets `dev`. Conventional commits. |
| IV. Quality Gates | **PASS** | Lint, typecheck, build, vitest must pass. Unit tests added for haversine, inference, ETA. |
| V. Stack Constraints | **PASS** | Uses existing stack: Next.js Route Handlers, Zod v4, Luxon, Supabase service client. No Edge Functions. |
| Security Constraints | **PASS** | Service role stays server-only. No new auth surfaces. Existing ingestion token auth reused. |
| Timezone & Data Consistency | **PASS** | All date comparisons use `nowBahia()` and Luxon with `America/Bahia`. |

## Project Structure

### Documentation (this feature)

```text
specs/017-stop-inference-eta/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── public-api.md    # Extended route API response shapes
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   ├── tracking/[vanId]/route.ts          # MODIFY — add inference call
│   │   ├── routes/route.ts                    # MODIFY — add progress + lastLat/Lng
│   │   ├── routes/[routeId]/route.ts          # MODIFY — add progress + lastLat/Lng
│   │   └── admin/routes/[routeId]/schedule/
│   │       ├── route.ts                       # MODIFY — accept/return stop_lat, stop_lng
│   │       └── [entryId]/route.ts             # MODIFY — accept/return stop_lat, stop_lng
│   └── (public)/routes/[routeId]/page.tsx     # MODIFY — pass progress to components
├── components/
│   ├── admin/schedule-editor.tsx              # MODIFY — add lat/lng inputs
│   └── public/
│       ├── hero-card.tsx                      # MODIFY — add ETA display
│       ├── route-card.tsx                     # MODIFY — add ETA line
│       └── schedule-timeline.tsx              # MODIFY — accept passedStopIds
├── lib/
│   ├── tracking/                              # NEW directory
│   │   ├── haversine.ts                       # NEW — pure distance function
│   │   ├── infer-stop-progress.ts             # NEW — stop inference module
│   │   └── eta.ts                             # NEW — ETA computation module
│   ├── validators/
│   │   └── schedule-entry.ts                  # MODIFY — add stopLat, stopLng fields
│   └── time.ts                                # MODIFY — add todayBahiaDate() helper
├── types/
│   └── index.ts                               # MODIFY — extend RouteWithStatus, RouteDetail, NextStop
└── __tests__/                                 # NEW directory
    └── tracking/                              # NEW directory
        ├── haversine.test.ts                  # NEW
        ├── infer-stop-progress.test.ts        # NEW
        └── eta.test.ts                        # NEW
```

**Structure Decision**: Follows existing repo layout. New tracking modules go under `src/lib/tracking/` (alongside existing `src/lib/api/`, `src/lib/validators/`, etc.). Tests go under `src/__tests__/tracking/` following vitest convention with the `@` path alias.

## Complexity Tracking

No constitution violations to justify. All new modules are single-purpose with clear responsibilities.
