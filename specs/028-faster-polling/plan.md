# Implementation Plan: Faster Polling Intervals

**Branch**: `028-faster-polling` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-faster-polling/spec.md`

## Summary

Reduce TanStack Query polling intervals from 60s/30s to 15s for routes and route detail, lower global staleTime from 30s to 10s, and enable refetchOnWindowFocus to eliminate stale status badges that persist for up to a minute after real-world state changes.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: @tanstack/react-query ^5.90.21
**Storage**: N/A (client-side config only)
**Testing**: Vitest
**Target Platform**: Mobile web browser (passenger-facing)
**Project Type**: Web application (Next.js)
**Performance Goals**: ≤10 req/min per user session; status updates visible within 15s
**Constraints**: Polling-only architecture; no WebSockets
**Scale/Scope**: 3 files, 5 value changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change — 5 numeric/boolean value edits across 3 files. No new abstractions, no new files, no new patterns. |
| II. Explicit Trade-offs | PASS | Trade-off: ~3x more requests/user vs. 4x faster status visibility. Documented in research.md. |
| III. Branch & Merge Discipline | PASS | Feature branch `028-faster-polling` targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be run before PR. |
| V. Stack Constraints | PASS | Uses TanStack Query (locked stack). No Edge Functions. No new dependencies. |
| Security Constraints | PASS | No security changes — client-side config only. |
| Timezone & Data Consistency | PASS | No time logic changes. |

**Post-Phase 1 re-check**: All gates still PASS. No data model or contract changes introduced.

## Project Structure

### Documentation (this feature)

```text
specs/028-faster-polling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no schema changes)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── app/
│   └── providers.tsx              # Global QueryClient config (staleTime, refetchOnWindowFocus)
└── lib/
    └── queries/
        ├── use-routes.ts          # Routes list refetchInterval
        ├── use-route-detail.ts    # Route detail refetchInterval
        └── use-announcements.ts   # Unchanged (60s)
```

**Structure Decision**: No new files or directories. All changes are value edits within existing files.

## Complexity Tracking

No constitution violations. No complexity justification needed.
