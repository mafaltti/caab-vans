# Implementation Plan: Fix ETA & Next Stop Time-Awareness

**Branch**: `019-fix-eta-next-stop` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-fix-eta-next-stop/spec.md`

## Summary

Fix a bug where `computeEta` and `inferStopProgress` pick the earliest pending stop by time order (e.g., CAAB @ 00:00) instead of the next upcoming stop relative to the current time. Three targeted changes: (1) time-aware filtering in `computeEta`, (2) time-aware filtering in `inferStopProgress`, (3) hybrid time+GPS classification in `deriveTimelineStops`. No database migration. No new features.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Luxon (timezone), Supabase JS client, TanStack Query
**Storage**: PostgreSQL via Supabase (no schema changes)
**Testing**: Vitest (unit tests for pure functions)
**Target Platform**: Web (mobile-first), server-side BFF
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: N/A (bug fix, negligible compute cost)
**Constraints**: All time operations in America/Bahia timezone via Luxon
**Scale/Scope**: 4 files modified, ~30 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Minimal targeted fix in 3 functions. No new abstractions. |
| II. Explicit Trade-offs | **PASS** | Trade-off: past-time pending stops remain "pending" in DB but are filtered at read time. Simpler than adding a "skipped" status (Approach B from fix plan). |
| III. Branch & Merge Discipline | **PASS** | Feature branch `019-fix-eta-next-stop`, PR targets `dev`. |
| IV. Quality Gates | **PASS** | Will add unit tests for `computeEta` and `deriveTimelineStops` time filtering. Lint/typecheck/build must pass. |
| V. Stack Constraints | **PASS** | Uses Luxon for time, computed fields in BFF. No Edge Functions. |
| Timezone & Data Consistency | **PASS** | All time comparisons use `nowBahia()` in America/Bahia. |
| Security Constraints | **PASS** | No auth changes. No key exposure. |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-fix-eta-next-stop/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contract diff)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files modified)

```text
src/
├── lib/
│   └── tracking/
│       ├── eta.ts                    # computeEta — add time-aware pending filter
│       └── infer-stop-progress.ts    # inferStopProgress — add time-aware nextStopId selection
├── components/
│   └── public/
│       └── schedule-timeline.tsx     # deriveTimelineStops — hybrid time+GPS classification
└── app/
    └── (public)/
        └── routes/
            └── [routeId]/
                └── page.tsx          # Pass serverTime to ScheduleTimeline
```

**Structure Decision**: Existing Next.js app structure. All changes are in-place modifications to existing files. No new files except tests.
