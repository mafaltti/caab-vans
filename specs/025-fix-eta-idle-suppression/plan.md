# Implementation Plan: Fix ETA Idle Suppression

**Branch**: `025-fix-eta-idle-suppression` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/025-fix-eta-idle-suppression/spec.md`

## Summary

Remove the condition that nulls out `progress` when `runStatus === "idle"` in both the routes list and route detail API endpoints. This allows the public page to display ETA and tracking progress regardless of driver shift status, while preserving the shift lifecycle for the driver UI and status badges.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Next.js, Supabase, Luxon, TanStack Query
**Storage**: PostgreSQL (via Supabase)
**Testing**: Vitest
**Target Platform**: Web (mobile-first)
**Project Type**: Web service (BFF + frontend)
**Performance Goals**: N/A (no new computation, same query patterns)
**Constraints**: Minimal diff, no new abstractions
**Scale/Scope**: 2-file change (both API route handlers)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Removing a condition is the simplest possible fix. No new abstractions. |
| II. Explicit Trade-offs in PRs | PASS | PR will document: removing idle suppression trades "clean idle state" for "always-available ETA". |
| III. Branch & Merge Discipline | PASS | Working on feature branch `025-fix-eta-idle-suppression`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be run before PR. |
| V. Stack Constraints | PASS | No new dependencies. BFF computes ETA (as required). |
| Security Constraints | PASS | No security changes. Service role key stays server-only. |
| Timezone & Data Consistency | PASS | No changes to time handling. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/025-fix-eta-idle-suppression/
├── plan.md
├── research.md
├── quickstart.md
└── checklists/
    └── requirements.md
```

### Source Code (files to modify)

```text
src/app/api/routes/route.ts              # Routes list endpoint — remove idle suppression
src/app/api/routes/[routeId]/route.ts    # Route detail endpoint — remove idle suppression
```

**Structure Decision**: No new files. Two existing API route handlers modified (condition removal only).
