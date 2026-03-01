# Implementation Plan: Clarify Next Stop Label

**Branch**: `013-clarify-next-stop-label` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-clarify-next-stop-label/spec.md`

## Summary

Replace the ambiguous "Parada atual / Próxima" label in the schedule timeline component with "Próxima parada" to match the hero card and eliminate user confusion. This is a single-line text change in one file.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: React, Tailwind CSS
**Storage**: N/A (no data changes)
**Testing**: vitest (existing suite), manual visual verification
**Target Platform**: Mobile web (responsive)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (no performance impact)
**Constraints**: None — purely cosmetic text change
**Scale/Scope**: 1 file, 1 line changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Single-line text replacement. No abstraction, no new code. |
| II. Explicit Trade-offs in PRs | PASS | PR will note: text-only change, no trade-offs needed. |
| III. Branch & Merge Discipline | PASS | Feature branch `013-clarify-next-stop-label` targets `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, tests before PR. |
| V. Stack Constraints | PASS | No stack changes. Existing React + Tailwind component. |
| Security Constraints | PASS | No security-relevant changes. |
| Timezone & Data | PASS | No date/time changes. |

**Gate result**: ALL PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/013-clarify-next-stop-label/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
src/components/public/
├── schedule-timeline.tsx   # Line 145: change label text (ONLY file modified)
└── hero-card.tsx           # Line 80: already uses "Próxima parada" (reference, no change)
```

**Structure Decision**: No structural changes. Single text edit in an existing component file.

## Complexity Tracking

> No violations — table not needed.
