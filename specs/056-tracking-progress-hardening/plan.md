# Implementation Plan: Tracking Progress Hardening

**Branch**: `056-tracking-progress-hardening` | **Date**: 2026-03-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/056-tracking-progress-hardening/spec.md`

## Summary

Harden the tracking progress system by fixing four correctness bugs identified in Phase 2 analysis: (1) enforce adjacency for persisted stop pointers at both write and read paths, (2) make confidence scoring deterministic by adding stable query ordering and explicit row cap, (3) render overdue ETA state in the route card UI instead of silently hiding it, (4) ensure `includeLastKnown=true` produces consistent top-level and nested response fields.

## Technical Context

**Language/Version**: TypeScript ~5, Next.js 16 (App Router), React 19
**Primary Dependencies**: Supabase JS client, Luxon, Zod, TanStack Query, Tailwind CSS 4
**Storage**: PostgreSQL (via self-hosted Supabase)
**Testing**: Vitest
**Target Platform**: Mobile web (Android primary), Linux VPS server
**Project Type**: Web service (Next.js BFF + public pages)
**Performance Goals**: N/A (correctness fix, no new performance targets)
**Constraints**: Canonical timezone America/Bahia; computed fields in BFF only
**Scale/Scope**: 2 backend files + 4 UI components + 1 page + 4 test files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | No new abstractions; minimal targeted fixes to existing functions |
| II. Explicit Trade-offs | PASS | Defense-in-depth (write + read adjacency) justified in research.md |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`; conventional branch name |
| IV. Quality Gates | PASS | All changes will have test coverage; lint/typecheck/build verified |
| V. Stack Constraints | PASS | No new dependencies; uses existing stack (Supabase, Luxon, Tailwind) |
| Security Constraints | PASS | No security surface changes; server-only logic unchanged |
| Timezone & Data Consistency | PASS | No timezone changes; Luxon usage unchanged |

**Post-Phase 1 re-check**: PASS — no new patterns or abstractions introduced.

## Project Structure

### Documentation (this feature)

```text
specs/056-tracking-progress-hardening/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/tracking/
│   ├── infer-stop-progress.ts       # Write-time adjacency + deterministic query
│   └── resolve-route-progress.ts    # Read-time adjacency + includeLastKnown fix
├── components/public/
│   ├── route-card.tsx               # Overdue ETA rendering
│   ├── hero-card.tsx                # Overdue ETA rendering (detail page)
│   ├── schedule-timeline.tsx        # Overdue ETA rendering (timeline)
│   └── route-detail-peek.tsx        # Overdue ETA rendering (bottom sheet)
├── app/(public)/routes/[routeId]/
│   └── page.tsx                     # etaStatus threading to all components
└── app/api/routes/
    ├── route.ts                     # (may need minor consistency fix)
    └── [routeId]/route.ts           # (may need minor consistency fix)

src/__tests__/tracking/
├── infer-stop-progress.test.ts      # New: adjacency + deterministic query tests
├── resolve-route-progress.test.ts   # New: adjacency rejection tests
├── eta.test.ts                      # New: overdue state rendering test
└── routes-api.test.ts               # New: includeLastKnown consistency tests
```

**Structure Decision**: Existing Next.js App Router layout. All changes modify existing files in `src/lib/tracking/`, `src/components/public/`, and `src/__tests__/tracking/`. No new files or directories needed.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
