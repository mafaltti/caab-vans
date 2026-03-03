# Implementation Plan: Road Snapping for Van GPS Positions

**Branch**: `033-road-snapping` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-road-snapping/spec.md`

## Summary

Snap van GPS coordinates to the nearest road using OSRM's trajectory-based map matching (`/match` endpoint) at ingestion time. Add `snapped_lat`/`snapped_lng` columns to the `vans` table. Serve corrected positions to map and ETA consumers with automatic fallback to raw GPS. OSRM is a soft dependency — if unavailable, the system operates exactly as today.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Next.js, Supabase (Postgres), OSRM (self-hosted, Docker), Zod, Luxon
**Storage**: Supabase Postgres — 2 new columns on `vans` table (`snapped_lat`, `snapped_lng`)
**Testing**: Vitest
**Target Platform**: Linux VPS (Docker) + Next.js server runtime
**Project Type**: Web service (BFF + frontend)
**Performance Goals**: <50ms added latency per GPS ping for OSRM call (including network + parsing)
**Constraints**: OSRM must be a soft dependency (graceful fallback to raw GPS); VPS needs 4 GB+ RAM
**Scale/Scope**: 4 vans × 4 pings/min × 12h/day = ~345,600 req/month; scales to 50+ vans at zero cost

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity (KISS/DRY/YAGNI)** | PASS | Minimal change: 2 DB columns, 1 new module (`osrm.ts`), modifications to 2 existing files. No new abstractions — OSRM call is a single function. |
| **II. Explicit Trade-offs** | PASS | Trade-off: adding ~5ms latency to ingestion path in exchange for all consumers getting corrected positions automatically. Documented in research.md. |
| **III. Branch & Merge Discipline** | PASS | Feature branch `033-road-snapping`, PR targets `dev`. Conventional commits. |
| **IV. Quality Gates** | PASS | Lint, type-check, build, tests will pass before PR. |
| **V. Stack Constraints** | PASS | Uses Next.js Route Handlers, Supabase Postgres, Zod validation, TypeScript. OSRM is infrastructure (Docker), not an application dependency that conflicts with the stack. No Edge Functions. |
| **Security Constraints** | PASS | OSRM is internal (localhost:5000), never exposed to clients. Service role key usage unchanged. No new public endpoints. |
| **Timezone** | N/A | No timezone-sensitive changes. GPS timestamps already handled. |

**Post-Phase 1 Re-check**: All gates still pass. No new abstractions, no stack violations, no complexity additions beyond the minimum required.

## Project Structure

### Documentation (this feature)

```text
specs/033-road-snapping/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: schema changes
├── quickstart.md        # Phase 1: dev setup guide
├── contracts/
│   └── osrm-match-api.md  # Phase 1: OSRM API contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/api/
│   ├── tracking/[vanId]/route.ts    # MODIFIED — add OSRM call after validation
│   └── routes/[routeId]/route.ts    # MODIFIED — serve snapped coords with fallback
├── lib/
│   └── tracking/
│       └── osrm.ts                  # NEW — OSRM match client (single function)
└── types/
    └── index.ts                     # MODIFIED — add snapped_lat/snapped_lng to Van type

supabase/
└── migrations/
    └── 00005_road_snapping.sql      # NEW — add 2 columns to vans table

infra/
└── osrm/                            # NEW — OSRM Docker stack (Phase 2)
    ├── docker-compose.yml
    └── .env.example
```

**Structure Decision**: Follows existing project layout. One new module (`osrm.ts`) in the tracking lib. One new infra stack (`infra/osrm/`) following the pattern of `infra/supabase/`. No new directories beyond these.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
