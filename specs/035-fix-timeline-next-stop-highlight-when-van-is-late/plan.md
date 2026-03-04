# Implementation Plan: Fix Timeline Next-Stop Highlight

**Branch**: `035-fix-timeline-next-stop-highlight-when-van-is-late` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-fix-timeline-next-stop-highlight-when-van-is-late/spec.md`

## Summary

Fix the `deriveTimelineStops` function so that the GPS/tracking-identified next stop is always highlighted as "current" in the schedule timeline, even when the van is running late and the stop's scheduled time has already passed. The root cause is a condition ordering bug where `entry.time < serverTime` short-circuits before checking `entry.id === inferredNextStopId`.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, TanStack Query, Vitest
**Storage**: N/A (frontend-only fix)
**Testing**: Vitest (`src/__tests__/components/schedule-timeline.test.ts`)
**Target Platform**: Mobile web browser
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (no performance impact — condition reorder only)
**Constraints**: Must not regress existing on-time display behavior
**Scale/Scope**: Single function fix + test additions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal one-condition reorder. No new abstractions. |
| II. Explicit Trade-offs | PASS | Will document in PR: condition reorder preserves all existing logic, only changes evaluation priority. |
| III. Branch & Merge Discipline | PASS | Working on feature branch, PR will target `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, tests. New tests added. |
| V. Stack Constraints | PASS | No stack changes. Uses existing Vitest test infrastructure. |
| Security Constraints | N/A | Frontend-only display fix, no auth/data changes. |
| Timezone & Data Consistency | N/A | Time string comparison logic unchanged, only priority reordered. |

**Post-design re-check**: Same — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/035-fix-timeline-next-stop-highlight-when-van-is-late/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
src/
├── components/
│   └── public/
│       └── schedule-timeline.tsx    # Bug fix: reorder condition in deriveTimelineStops
└── __tests__/
    └── components/
        └── schedule-timeline.test.ts  # New tests for late-van scenarios
```

**Structure Decision**: No new files needed. Fix is contained within the existing `schedule-timeline.tsx` component and its existing test file.
