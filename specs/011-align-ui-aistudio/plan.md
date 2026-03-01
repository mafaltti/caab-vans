# Implementation Plan: Align UI with AI Studio Prototype

**Branch**: `011-align-ui-aistudio` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-align-ui-aistudio/spec.md`

## Summary

Align 4 specific UI elements in the CAAB Vans mobile web app to match the Google AI Studio prototype: (1) move the route status badge to the top-right of the card header, (2) move the chevron icon inside the next-stop info bar, (3) add a rose-colored left accent bar to urgent announcement cards, and (4) reposition the "Ver paradas anteriores" button inline with the "Horarios" header and make it a bidirectional toggle.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, Tailwind CSS, shadcn/ui, Lucide icons, Motion
**Storage**: N/A (no data changes)
**Testing**: Vitest (if UI tests exist for affected components)
**Target Platform**: Mobile-first web (all modern browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (layout-only changes, no performance impact)
**Constraints**: Must match AI Studio prototype visually; preserve existing animations and touch targets
**Scale/Scope**: 3 component files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal changes to 3 existing components. No new abstractions. No speculative complexity. |
| II. Explicit Trade-offs | PASS | Pure layout adjustments — trade-off is prototype fidelity over current layout. Will document in PR. |
| III. Branch & Merge Discipline | PASS | Working on feature branch `011-align-ui-aistudio`. PR will target `dev`. |
| IV. Quality Gates | PASS | Lint, type-check, build, and tests will be run before PR. |
| V. Stack Constraints | PASS | Using existing stack: Tailwind CSS, shadcn/ui, Lucide icons. No new dependencies. |
| Security Constraints | PASS | No security-relevant changes. |
| Timezone & Data | PASS | No date/time changes. |

**Gate result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/011-align-ui-aistudio/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (minimal — no unknowns)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (affected files)

```text
src/
└── components/
    └── public/
        ├── route-card.tsx            # FR-001, FR-002, FR-003 (badge + chevron layout)
        ├── announcement-card.tsx     # FR-004, FR-005 (urgent accent bar)
        └── schedule-timeline.tsx     # FR-006, FR-007, FR-008 (toggle position + behavior)
```

**Structure Decision**: No new files or directories. All changes are layout modifications within 3 existing component files.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
