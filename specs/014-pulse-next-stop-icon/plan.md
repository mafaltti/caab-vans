# Implementation Plan: Pulse Animation on Next Stop Icon

**Branch**: `014-pulse-next-stop-icon` | **Date**: 2026-03-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-pulse-next-stop-icon/spec.md`

## Summary

Add a continuous pulse animation (opacity fade) to the inner dot of the "current" stop icon in the schedule timeline. The animation uses Tailwind's built-in `animate-pulse` class, matching the AI Studio prototype and the existing pattern in `RouteStatusBadge`. Reduced motion preferences are respected via the `useReducedMotion()` hook from `motion/react`, following the established pattern in `HeroCard`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Tailwind CSS (`animate-pulse`), `motion/react` (`useReducedMotion` hook)
**Storage**: N/A — no data changes
**Testing**: Vitest (if tests exist for the component)
**Target Platform**: Mobile-first web app (all modern browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A — CSS animation has negligible performance impact
**Constraints**: Must respect `prefers-reduced-motion` accessibility setting
**Scale/Scope**: Single component change (`schedule-timeline.tsx`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| **I. Simplicity (KISS/DRY/YAGNI)** | PASS | Single CSS class addition + one hook import. No new abstractions, no speculative complexity. |
| **II. Explicit Trade-offs** | PASS | Trade-off: using JS hook (`useReducedMotion`) over CSS media query for consistency with HeroCard pattern. Documented in research.md. |
| **III. Branch & Merge Discipline** | PASS | Working on feature branch `014-pulse-next-stop-icon`. PR will target `dev`. |
| **IV. Quality Gates** | PASS | Lint, type-check, build, and tests will be verified before PR. |
| **V. Stack Constraints** | PASS | Uses Tailwind CSS (locked stack) and Motion library hook (locked stack). No new dependencies introduced. |
| **Security Constraints** | N/A | No security-sensitive changes. |
| **Timezone & Data** | N/A | No data or time-related changes. |

**Post-Phase 1 re-check**: All gates still pass. No data model, no contracts, no new dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/014-pulse-next-stop-icon/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── quickstart.md        # Implementation quickstart guide
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files affected)

```text
src/
└── components/
    └── public/
        └── schedule-timeline.tsx   # Only file modified
```

**Structure Decision**: This is a single-file change within the existing Next.js App Router project structure. The `ScheduleTimeline` component at `src/components/public/schedule-timeline.tsx` is the only file that needs modification. No new files, no new directories.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.
