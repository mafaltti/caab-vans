# Implementation Plan: GPS-Distance-Based ETA

**Branch**: `021-gps-distance-eta` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-gps-distance-eta/spec.md`

## Summary

Replace the schedule-delay-only ETA with a GPS-distance-based computation: when the van has a fresh position, sufficient speed, and the next stop has coordinates, compute ETA from haversine distance and current speed. Fall back to the existing schedule-delay logic otherwise. Add an `etaSource` field so consumers know which method was used.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Luxon (DateTime), existing `haversineDistanceMeters()` utility
**Storage**: Supabase (Postgres) — existing `vans.last_speed_mps`, `schedule_entries.stop_lat/stop_lng` columns
**Testing**: Vitest
**Target Platform**: Web (server-side BFF via Next.js Route Handlers)
**Project Type**: Web service (BFF)
**Performance Goals**: N/A — trivial computation (one haversine + division per request)
**Constraints**: ETA computed in BFF per constitution V. Luxon with America/Bahia timezone.
**Scale/Scope**: 2 API endpoints, 1 core function, 1 type file, 1 test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Adds a GPS branch to existing `computeEta()` with fallback. No new abstractions, no speculative features. Reuses existing `haversineDistanceMeters()`. |
| II. Explicit Trade-offs | PASS | Haversine × 1.3 road factor chosen over road-network routing (simpler, good enough for urban van routes). Will be documented in PR. |
| III. Branch & Merge | PASS | Feature branch `021-gps-distance-eta` targeting `dev`. |
| IV. Quality Gates | PASS | New tests added. Lint, type-check, build, tests must pass. |
| V. Stack Constraints | PASS | TypeScript, Luxon (America/Bahia), Next.js Route Handlers. ETA computed in BFF. No Edge Functions. |
| Security | PASS | No new keys, no client-side secrets. GPS data already flows through server. |
| Timezone | PASS | All DateTime operations use Luxon with America/Bahia. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/021-gps-distance-eta/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── eta-contract.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── lib/
│   └── tracking/
│       └── eta.ts              # Core: add GPS branch + VanPosition interface
├── types/
│   └── index.ts                # Add etaSource to RouteProgress
├── app/
│   └── api/
│       └── routes/
│           ├── route.ts        # Route list: wire vanPosition + stop coords
│           └── [routeId]/
│               └── route.ts    # Route detail: same wiring
└── __tests__/
    └── tracking/
        └── eta.test.ts         # Add GPS ETA test cases
```

**Structure Decision**: All changes modify existing files. No new files or directories needed in `src/`. The feature extends the existing ETA computation path.
