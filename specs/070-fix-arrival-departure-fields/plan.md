# Implementation Plan: Fix Arrival/Departure Time Field Usage

**Branch**: `070-fix-arrival-departure-fields` | **Date**: 2026-03-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/070-fix-arrival-departure-fields/spec.md`

## Summary

Seven locations in the codebase use the wrong time field (`arrival_time` vs `departure_time`) when comparing against schedule times. All fixes are single-field swaps with no logic changes. New test cases with distinct arrival/departure values will be added to cover each fix location.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 App Router)
**Primary Dependencies**: Luxon (date/time), Supabase (database client)
**Storage**: Supabase self-hosted Postgres (no schema changes needed)
**Testing**: Vitest (unit tests)
**Target Platform**: Linux server (Next.js SSR) + mobile web browser
**Project Type**: Web service (BFF + public pages)
**Performance Goals**: N/A — field swaps, no performance impact
**Constraints**: Backward compatible when arrival_time == departure_time
**Scale/Scope**: 7 single-line fixes + corresponding test updates across 5 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Each fix is a single field name swap. No new abstractions, no new files. |
| II. Explicit Trade-offs in PRs | PASS | PR will list all 7 locations with before/after. No trade-offs — all fixes are unambiguously correct. |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`. Conventional branch name. |
| IV. Quality Gates | PASS | lint + typecheck + build + vitest must all pass. |
| V. Stack Constraints | PASS | No new dependencies. Uses existing Luxon date/time patterns. |
| Security Constraints | PASS | No security surface changes. |
| Timezone & Data Consistency | PASS | All time comparisons remain in America/Bahia via existing Luxon calls. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/070-fix-arrival-departure-fields/
├── plan.md              # This file
├── research.md          # Phase 0 output (minimal — no unknowns)
├── data-model.md        # Phase 1 output (semantic model only, no schema changes)
├── quickstart.md        # Phase 1 output (fix map)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── time.ts                                    # Fixes #1 (line 73), #3a (line 51)
│   └── tracking/
│       ├── infer-stop-progress.ts                 # Fix #2a (line 199)
│       ├── process-device-geofence-events.ts      # Fix #2b (line 225)
│       └── resolve-route-progress.ts              # Fixes #3b (line 82), #3c (line 390)
├── app/api/
│   └── driver/routes/route.ts                     # Fix #4 (line 123)
└── __tests__/
    ├── lib/
    │   └── time.test.ts                           # New file: tests for getNextStop, isWithinScheduleWindow
    ├── api/driver/routes/
    │   └── route.test.ts                          # New file: test for driver API isPastScheduleWindow
    └── tracking/
        ├── infer-stop-progress.test.ts            # New test cases for fix #2a
        ├── process-device-geofence-events.test.ts # New test cases for fix #2b
        └── resolve-route-progress.test.ts         # New test cases for fixes #3b, #3c
```

**Structure Decision**: All fixes are in existing source files. Two new test files created: `src/__tests__/lib/time.test.ts` and `src/__tests__/api/driver/routes/route.test.ts`. Existing tracking test files get new test cases appended.
