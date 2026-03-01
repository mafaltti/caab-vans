# Implementation Plan: Inactive Route Schedule Display

**Branch**: `010-inactive-route-schedule` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-inactive-route-schedule/spec.md`

## Summary

When a route is out of operation (`isRunning = false`), the schedule timeline currently hides all stops behind a collapsible "Ver X paradas anteriores" button because all stops get classified as "past" when there's no `nextStopId`. The fix passes the `isRunning` flag to `ScheduleTimeline`, introduces a new `"neutral"` stop status for inactive routes, and bypasses the collapsible logic so all stops display immediately with a neutral visual style.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, Tailwind CSS, shadcn/ui, Lucide icons
**Storage**: N/A (no data model changes)
**Testing**: Vitest
**Target Platform**: Mobile-first web app
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (no performance-sensitive changes)
**Constraints**: Frontend-only change; no API modifications
**Scale/Scope**: 2 files modified, 1 type definition updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change — adds one prop, one status value, one conditional branch. No new abstractions. |
| II. Explicit Trade-offs | PASS | PR will document: reusing existing "future" node styling for neutral stops (DRY). |
| III. Branch & Merge Discipline | PASS | Working on feature branch `010-inactive-route-schedule`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, type-check, build, and tests will be verified before PR. |
| V. Stack Constraints | PASS | Uses existing Tailwind + shadcn/ui + Lucide. No new dependencies. |
| Security Constraints | N/A | No server-side or auth changes. |
| Timezone & Data Consistency | N/A | No time computation changes. |

## Project Structure

### Documentation (this feature)

```text
specs/010-inactive-route-schedule/
├── plan.md              # This file
├── research.md          # Phase 0 output (trivial — no unknowns)
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (files touched)

```text
src/
├── types/
│   └── index.ts                           # Add "neutral" to TimelineStopStatus
├── components/public/
│   └── schedule-timeline.tsx              # Accept isRunning prop, handle neutral display
└── app/(public)/routes/[routeId]/
    └── page.tsx                           # Pass isRunning to ScheduleTimeline
```

**Structure Decision**: No new files created. All changes modify existing files in the established project layout.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
