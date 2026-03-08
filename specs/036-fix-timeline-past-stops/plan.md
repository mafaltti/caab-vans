# Implementation Plan: Fix Timeline Past Stops

**Branch**: `036-fix-timeline-past-stops` | **Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/036-fix-timeline-past-stops/spec.md`

## Summary

Fix the `deriveTimelineStops()` function in the schedule timeline component. The hybrid GPS+time classification mode incorrectly uses `entry.time < serverTime` to mark stops as "past" without respecting schedule order — causing future stops to appear as passed when the van is running late. The fix uses the `inferredNextStopId` index as a boundary: stops before it are "past" (by schedule order or GPS), stops after are "future". The time-based fallback is preserved only when no current stop position is known.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, Next.js, TanStack Query
**Storage**: N/A (no data model changes — classification is client-side)
**Testing**: Vitest
**Target Platform**: Mobile web (all browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (no performance impact — same loop, same complexity)
**Constraints**: No changes to API contract or data model
**Scale/Scope**: 2 files changed (component + test)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change to existing function; no new abstractions |
| II. Explicit Trade-offs | PASS | Trade-off: schedule-order priority over time-based fallback for stops after current |
| III. Branch & Merge Discipline | PASS | Feature branch `036-fix-timeline-past-stops`, PR targets `dev` |
| IV. Quality Gates | PASS | Existing tests updated + new test case; lint/typecheck/build unaffected |
| V. Stack Constraints | PASS | No new dependencies; uses existing TypeScript/Vitest stack |
| Security Constraints | N/A | No auth/RLS/key changes |
| Timezone & Data Consistency | N/A | No time display changes; classification logic only |

**Post-Phase 1 re-check**: All gates still pass. No data model or contract changes introduced.

## Project Structure

### Documentation (this feature)

```text
specs/036-fix-timeline-past-stops/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files affected)

```text
src/
├── components/
│   └── public/
│       └── schedule-timeline.tsx    # deriveTimelineStops() — THE FIX
└── __tests__/
    └── components/
        └── schedule-timeline.test.ts  # Add late-van regression test
```

**Structure Decision**: No new files. Fix is contained within the existing `schedule-timeline.tsx` component and its co-located test file.
