# Implementation Plan: Fix Tracking Freshness Check

**Branch**: `020-fix-tracking-freshness` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-fix-tracking-freshness/spec.md`

## Summary

Replace the `isSameDay` calendar-day freshness check with a recency-based check (`isLocationFresh`) that compares elapsed time since last GPS ping against a 10-minute threshold. This fixes vans incorrectly showing "Fora de operacao" after midnight despite active GPS pings. The change touches `src/lib/time.ts` (new function + constant), both route API handlers, and adds unit tests.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Luxon (date/time), Supabase JS client
**Storage**: Supabase (Postgres) — no schema changes needed
**Testing**: Vitest
**Target Platform**: Web (server-side BFF route handlers)
**Project Type**: Web service (Next.js BFF)
**Performance Goals**: N/A — same query pattern, no performance impact
**Constraints**: All date/time ops must use Luxon with `America/Bahia` timezone
**Scale/Scope**: 2 API routes, 1 utility function, 1 test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Replaces broken function with a simpler one. Single constant, no configurability beyond code. DRY: one shared function used by both API routes. |
| II. Explicit Trade-offs | PASS | PR will document: removing calendar-day check in favor of recency check; 10-minute threshold chosen based on ~30s ping frequency. |
| III. Branch & Merge Discipline | PASS | Working on feature branch `020-fix-tracking-freshness`; PR will target `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, and tests before PR. New unit tests added. |
| V. Stack Constraints | PASS | Uses Luxon for time math. Freshness computed in BFF (route handlers). No Edge Functions. |
| Timezone & Data Consistency | PASS | All time comparisons use Luxon with `America/Bahia`. |
| Security Constraints | PASS | No security surface changes. |

## Project Structure

### Documentation (this feature)

```text
specs/020-fix-tracking-freshness/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── checklists/
│   └── requirements.md
└── quickstart.md        # Phase 1 output
```

### Source Code (files touched)

```text
src/
├── lib/
│   └── time.ts                          # Replace isSameDay → isLocationFresh + STALENESS_THRESHOLD_MINUTES constant
├── app/api/routes/
│   ├── route.ts                         # Update freshness check (list endpoint)
│   └── [routeId]/route.ts              # Update freshness check (detail endpoint)
└── __tests__/
    └── time/
        └── is-location-fresh.test.ts    # New unit tests
```

**Structure Decision**: No new directories or files beyond the test file. This is a minimal change to existing code paths.

## Complexity Tracking

No constitution violations. Table not applicable.
