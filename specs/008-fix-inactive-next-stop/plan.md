# Implementation Plan: Hide Next-Stop Display for Inactive Routes

**Branch**: `008-fix-inactive-next-stop` | **Date**: 2026-02-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-fix-inactive-next-stop/spec.md`

## Summary

Routes marked "Fora de operação" (`isRunning = false`) incorrectly display next-stop information on both the route list cards and the route detail hero card. The fix nullifies `nextStop` in the BFF when the route is not running (per constitution: computed fields in BFF), and adds a dedicated "Fora de operação" fallback state in the hero card component.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Next.js, React, TanStack Query, Luxon
**Storage**: Supabase (Postgres) — no changes needed
**Testing**: Vitest
**Target Platform**: Mobile web (responsive)
**Project Type**: Web application (frontend + BFF)
**Performance Goals**: N/A — no performance-sensitive changes
**Constraints**: BFF must be the authority for computed fields (constitution V)
**Scale/Scope**: 3 files modified, ~10 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change — 3 files, no new abstractions |
| II. Explicit Trade-offs | PASS | Trade-off: BFF-only fix vs redundant UI guards. Chose BFF per constitution. |
| III. Branch & Merge Discipline | PASS | Feature branch `008-fix-inactive-next-stop`, PR targets `dev` |
| IV. Quality Gates | PASS | lint + typecheck + build required before merge |
| V. Stack Constraints | PASS | Computed field (`nextStop`) gated in BFF. No new dependencies. |
| Security Constraints | N/A | No auth/key changes |
| Timezone & Data Consistency | N/A | No time format changes |

**Post-Phase 1 re-check**: PASS — no new violations introduced by design decisions.

## Project Structure

### Documentation (this feature)

```text
specs/008-fix-inactive-next-stop/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── app/
│   └── api/
│       └── routes/
│           ├── route.ts                  # FIX: nullify nextStop when !isRunning
│           └── [routeId]/route.ts        # FIX: nullify nextStop when !isRunning
└── components/
    └── public/
        └── hero-card.tsx                 # FIX: add !isRunning fallback state
```

**Structure Decision**: Existing Next.js App Router layout. No new files or directories needed.

## Complexity Tracking

No constitution violations — this section is intentionally empty.
