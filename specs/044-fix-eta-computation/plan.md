# Implementation Plan: Fix ETA Computation

**Branch**: `044-fix-eta-computation` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/044-fix-eta-computation/spec.md`

## Summary

Fix three ETA computation bugs: (1) use OSRM travel duration instead of distance/instantaneous-speed, (2) allow GPS-based ETA when van is stationary but close to a stop, (3) smooth speed for haversine fallback. Changes are confined to the BFF ETA computation layer — no database migration, no UI changes, no tracker changes.

## Technical Context

**Language/Version**: TypeScript ~5, Next.js 15 (App Router)
**Primary Dependencies**: Luxon (timezone), Zod (validation), OSRM (routing)
**Storage**: Supabase (PostgreSQL self-hosted) — read-only usage, no schema changes
**Testing**: Vitest 4.x (29 existing ETA tests)
**Target Platform**: Web service (BFF layer)
**Project Type**: Web application (Next.js)
**Performance Goals**: ETA computation < 200ms per route (current budget, unchanged)
**Constraints**: OSRM timeout 100ms, 5-second ping interval from tracker
**Scale/Scope**: ~10 active vans, ~50 stops total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Changes modify one core file (`eta.ts`) + two API routes. One small pure helper (`computeSmoothedSpeed`) for clarity — no new modules or patterns. |
| II. Explicit Trade-offs | PASS | Trade-off: adding a DB query (10 pings) per ETA call for smoothed speed vs. storing smoothed value on `vans` table. Chose read-time query — simpler, no migration, indexed query on ~10 rows. |
| III. Branch & Merge Discipline | PASS | Feature branch `044-fix-eta-computation`, PR targets `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, tests. Existing 29 ETA tests updated + new tests added. |
| V. Stack Constraints | PASS | Uses existing stack (Next.js, Luxon, Supabase, OSRM). No new dependencies. No Edge Functions. |
| Security Constraints | PASS | No new API endpoints. No client-side changes. Service role key usage unchanged. |
| Timezone | PASS | All time operations already use Luxon with America/Bahia. No changes. |

**Post-Phase 1 Re-check**: All gates still pass. No new abstractions, no schema changes, no new dependencies introduced in design.

## Project Structure

### Documentation (this feature)

```text
specs/044-fix-eta-computation/
├── plan.md              # This file
├── research.md          # Phase 0: codebase research findings
├── data-model.md        # Phase 1: data model (no schema changes)
├── quickstart.md        # Phase 1: development quickstart
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── lib/
│   └── tracking/
│       └── eta.ts              # Core changes: OSRM duration, proximity fallback, smoothed speed
├── app/
│   └── api/
│       └── routes/
│           ├── route.ts        # Add recent pings query for smoothed speed
│           └── [routeId]/
│               └── route.ts    # Add recent pings query for smoothed speed
└── __tests__/
    └── tracking/
        └── eta.test.ts         # Update + add test cases
```

### Files NOT modified (confirmed unchanged)

- `src/lib/tracking/osrm.ts` — already returns `durationSeconds`, no changes needed
- `src/lib/tracking/haversine.ts` — pure math, unchanged
- `src/lib/tracking/time-factors.ts` — timeFactor logic unchanged
- `src/lib/tracking/infer-stop-progress.ts` — geofencing unchanged (FR-007)
- `supabase/migrations/` — no schema changes needed

## Design Decisions

### D1: Use OSRM duration as base ETA (FR-002, FR-003)

**Current**: `baseTravelMinutes = distanceMeters / vanPosition.speedMps / 60`
**New**: `baseTravelMinutes = osrmResult.durationSeconds / 60` when OSRM is available

Then apply `timeFactor` on top (unchanged). OSRM uses static OSM speed limits; timeFactor corrects for real-world congestion.

When OSRM is unavailable, fall back to haversine path (with smoothed speed — see D3).

### D2: Proximity-based ETA at speed=0 (FR-001)

**Current**: GPS branch requires `speedMps >= 1.0`. At speed=0, falls back to schedule.
**New**: Enter GPS branch if EITHER:
- `speedMps >= 1.0` (existing), OR
- `speedMps < 1.0` AND `haversineDistance(van, nextStop) <= 500m`

When entering via proximity path, use constant fallback speed of 4.2 m/s (~15 km/h) for the haversine computation. OSRM duration path does not need a speed value (it's time-based).

### D3: Smoothed speed for haversine fallback (FR-004)

**Current**: `distanceMeters / vanPosition.speedMps / 60` — uses single instantaneous reading.
**New**: Accept `recentSpeeds: number[]` in `computeEta()` args. When using haversine fallback (no OSRM), compute mean of non-zero values from last 10 pings.

**Data source**: Route detail API and routes list API query `van_location_pings` for the 10 most recent pings per van. This is a single indexed query (10 rows).

If all recent speeds are 0 or no readings exist → use proximity fallback (D2) if within 500m, otherwise schedule fallback (FR-005).

### D4: Division-by-zero protection (FR-006)

Smoothed speed can be 0 if all 10 pings have speed=0. In this case:
- Within 500m: use fallback speed 4.2 m/s (D2)
- Beyond 500m: schedule fallback (existing behavior)

No division by zero is possible because we never divide by speed when it's 0.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
