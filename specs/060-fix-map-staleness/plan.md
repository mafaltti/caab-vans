# Implementation Plan: Fix Map Staleness

**Branch**: `060-fix-map-staleness` | **Date**: 2026-03-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/060-fix-map-staleness/spec.md`

## Summary

Vans appear stuck on the map due to aggressive client-side GPS ping throttling and a stale-fix feedback loop during Android doze. This plan addresses four fixes: reduce stationary heartbeat interval (60s → 20s), skip stale guard during cold gaps, lower the staleness warning threshold (10 min → 3 min), and add a "last updated" timestamp to the map UI. All changes are small constant tweaks or minor UI additions — no database or API contract changes required.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 + Expo SDK 55)
**Primary Dependencies**: Next.js (web), Expo/React Native (tracker), MapLibre GL, TanStack Query, Luxon
**Storage**: PostgreSQL via Supabase (no schema changes)
**Testing**: Vitest (web app only — tracker app has no test infrastructure)
**Target Platform**: Android (tracker), Mobile web (frontend)
**Project Type**: Web service + mobile tracker app
**Performance Goals**: Stationary vans send ≥3 pings/min; staleness warning within 3 min
**Constraints**: Minimal bandwidth increase; no API contract changes
**Scale/Scope**: 4 vans, ~100 daily users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | All changes are constant tweaks or minimal logic changes. No new abstractions introduced. |
| II. Explicit Trade-offs | PASS | PR will document before/after for the stale guard change. Other changes are 1-line constant updates. |
| III. Branch & Merge Discipline | PASS | Feature branch `060-fix-map-staleness` targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, and tests will be run. Existing staleness test will be updated. |
| V. Stack Constraints | PASS | No new dependencies. Uses existing Luxon for time, TanStack Query for polling. BFF computes `isLocationOutdated`. |
| Security Constraints | PASS | No auth/key changes. Public read data only. |
| Timezone & Data Consistency | PASS | Staleness computed in `America/Bahia` via Luxon (existing behavior preserved). |

**Post-Phase 1 re-check**: PASS — no new violations introduced by design decisions.

## Project Structure

### Documentation (this feature)

```text
specs/060-fix-map-staleness/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── checklists/
    └── requirements.md
```

### Source Code (files modified)

```text
apps/van-tracker/src/location/
└── task.ts                          # Stationary throttle + stale guard changes

src/
├── lib/
│   └── time.ts                      # Staleness threshold constant
├── components/public/
│   └── van-tracking-map.tsx         # "Last updated" timestamp display
├── app/(public)/routes/[routeId]/
│   └── page.tsx                     # Thread lastGpsFixAt to map component
└── __tests__/time/
    └── is-location-fresh.test.ts    # Update test for new threshold
```

**Structure Decision**: This feature touches existing files only — 3 source files, 1 test file, 1 page file for prop threading. No new files created in source tree.
