# Implementation Plan: Hide Idle Status from Passenger UI

**Branch**: `026-hide-idle-status` | **Date**: 2026-03-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/026-hide-idle-status/spec.md`

## Summary

Remove the "Entre turnos" (between shifts) display from the two passenger-facing components — `RouteStatusBadge` and `HeroCard`. When `runStatus` is `"idle"`, these components should fall through to their existing active-route rendering instead of showing a dedicated idle state. No backend, API, or driver UI changes needed.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, Tailwind CSS, Lucide icons
**Storage**: N/A (no data changes)
**Testing**: vitest (lint + typecheck + build as quality gates)
**Target Platform**: Mobile-first web (all browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (removing code, not adding)
**Constraints**: None — purely removing two conditional branches
**Scale/Scope**: 2 files changed, ~15 lines removed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Removing code — the simplest possible change. No new abstractions. |
| II. Explicit Trade-offs | PASS | Trade-off: losing shift visibility for passengers in exchange for clearer UX. Justified by spec. |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`. Conventional branch name. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, tests before PR. |
| V. Stack Constraints | PASS | No stack changes. Editing existing React components with Tailwind. |
| Security Constraints | PASS | No security implications — purely UI display change. |
| Timezone & Data | PASS | No time/data changes. |

**Post-design re-check**: All gates still pass. No new concerns from design phase.

## Project Structure

### Documentation (this feature)

```text
specs/026-hide-idle-status/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no data changes)
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (files to modify)

```text
src/components/public/
├── route-status-badge.tsx   # Remove "idle" early-return (lines 9-15)
└── hero-card.tsx            # Remove "idle" early-return (lines 54-63)
```

**Structure Decision**: No new files. Two existing files modified by removing code.

## Complexity Tracking

No violations to justify. This is a code-removal change.
