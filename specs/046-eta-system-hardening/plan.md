# Implementation Plan: ETA System Hardening

**Branch**: `046-eta-system-hardening` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/046-eta-system-hardening/spec.md`

## Summary

Harden the ETA computation pipeline by addressing 11 identified gaps: add hysteresis to prevent jarring GPS/schedule transitions, switch speed smoothing from mean to median, gate timeFactor blending at N>=3 segments, align runtime/training distance computation via pre-computed OSRM distances, add direction detection for haversine fallback, unify constants, document magic numbers, gate debug logging, add Sunday default factors, and provide calibration script documentation.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Luxon (datetime), OSRM (routing), Supabase (Postgres via service role), Zod (validation)
**Storage**: PostgreSQL (Supabase self-hosted) — one new nullable column on `schedule_entries`
**Testing**: Vitest — existing test file at `src/lib/tracking/__tests__/eta.test.ts`
**Target Platform**: Web (Next.js server-side BFF + client)
**Project Type**: Web service (BFF route handlers computing ETA)
**Performance Goals**: ETA computation must add zero latency to the route API hot path. Pre-computed OSRM distances avoid runtime routing calls for congestion calibration.
**Constraints**: OSRM service may be unavailable (graceful fallback required). 5-van fleet, ~3-5 pings/min per van.
**Scale/Scope**: 5 vans, ~15 stops per route, ~900-1,500 ETA computations/hour

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | All changes are minimal targeted fixes. No speculative abstractions. Median replaces mean (same complexity). Hysteresis inferred from existing data (no new infrastructure). |
| II. Explicit Trade-offs | PASS | Each research decision documents alternatives and rejection rationale. |
| III. Branch & Merge Discipline | PASS | Feature branch `046-eta-system-hardening` targeting `dev`. |
| IV. Quality Gates | PASS | Existing test file will be updated. Lint/typecheck/build must pass. |
| V. Stack Constraints | PASS | All changes within existing stack (TypeScript, Next.js, Supabase, Luxon). No new dependencies. |
| Security Constraints | PASS | No client-side secrets. OSRM distances are public road data. |
| Timezone | PASS | No timezone changes. All existing Luxon usage preserved. |

### Post-Design Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | PASS | One new DB column (`osrm_distance_m`). No new tables, services, or abstractions. Constants unified, not centralized into a shared module (YAGNI — only 2 consumers). |
| II. Explicit Trade-offs | PASS | Schedule delay kept as last-stop-only (documented trade-off in spec Assumptions). N>=3 threshold chosen over weighted approach (KISS). |
| V. Stack Constraints | PASS | Migration is standard Supabase SQL. Pre-compute script uses `pg` directly (consistent with existing `compute-time-factors.ts`). |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/046-eta-system-hardening/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: schema + entity changes
├── quickstart.md        # Phase 1: developer quickstart
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/lib/tracking/
├── eta.ts               # Core ETA (hysteresis, median speed, direction, logging, constants)
├── time-factors.ts      # timeFactor blending (N>=3 gate, buildRecentRuns with OSRM distances)
├── haversine.ts         # Haversine distance + new computeBearing()
├── osrm.ts              # OSRM routing client (unchanged)
└── __tests__/
    └── eta.test.ts      # Updated tests for median, hysteresis, direction

src/app/api/routes/
├── [routeId]/route.ts   # Route detail API (device_ts in pings query, osrm_distance_m)
└── route.ts             # Routes list API (same changes)

scripts/
├── compute-time-factors.ts    # Calibration script (constant alignment, documentation)
└── precompute-stop-distances.ts  # New: one-time OSRM distance pre-computation

supabase/migrations/
└── XXXXX_add_osrm_distance.sql   # Add osrm_distance_m column
```

**Structure Decision**: All changes fit within the existing Next.js App Router structure. No new directories needed. One new script (`precompute-stop-distances.ts`) follows the existing pattern of standalone scripts in `scripts/`.
