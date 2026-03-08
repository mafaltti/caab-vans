# Implementation Plan: Progress Pointer Cutover

**Branch**: `052-progress-pointer-cutover` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/052-progress-pointer-cutover/spec.md`

## Summary

Make the persisted `route_runs.next_stop_id` the authoritative source of truth for ETA targeting, next-stop resolution, and UI display alignment. This involves: (1) hardening the write path with error capture, (2) adding explicit target support to ETA computation, (3) extracting a shared progress resolver from two duplicated route handlers, (4) implementing a three-mode rollout flag (legacy/shadow/persisted), and (5) adding test coverage for new behaviors.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Supabase (PostgreSQL), Luxon (timezone), Zod (validation), TanStack Query (client-side)
**Storage**: PostgreSQL via Supabase self-hosted Docker stack
**Testing**: Vitest (jsdom environment), pure unit tests
**Target Platform**: Web (mobile-first BFF + SSR)
**Project Type**: Web application (Next.js BFF + public frontend)
**Performance Goals**: No new performance targets — this is a correctness/consistency improvement. Existing API response times must not regress.
**Constraints**: Server-side only changes. No new database migrations. No new client-side dependencies.
**Scale/Scope**: Single-digit concurrent routes, low-traffic public transport app. Changes affect 5 source files + 1 new file + 3 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Shared resolver eliminates ~160 lines of exact duplication (DRY, 2 occurrences but 100% identical critical-path logic). Feature flag is YAGNI-borderline but justified by rollout safety for a source-of-truth cutover. |
| II. Explicit Trade-offs | **PASS** | Will be documented in PR description. Key trade-off: extracting resolver adds one indirection level but eliminates duplication and creates a single point for shadow/cutover logic. |
| III. Branch & Merge | **PASS** | Feature branch targets `dev`. Conventional commits. |
| IV. Quality Gates | **PASS** | Lint, typecheck, build, tests will all pass. New tests added for new behavior. |
| V. Stack Constraints | **PASS** | All changes within existing stack. No new dependencies. BFF computes progress (per constitution). |
| Security | **PASS** | Server-side only. No new client exposure. Service role key usage unchanged. |
| Timezone | **PASS** | No timezone changes. Luxon + America/Bahia unchanged. |

**Post-Phase-1 Re-check**: All gates still pass. No new dependencies, no schema changes, no client-side changes.

## Project Structure

### Documentation (this feature)

```text
specs/052-progress-pointer-cutover/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity behavior changes (no schema changes)
├── quickstart.md        # Getting started guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/tracking/
│   ├── eta.ts                        # Modified: add targetStopId parameter
│   ├── infer-stop-progress.ts        # Modified: add error capture to 3 writes
│   ├── resolve-route-progress.ts     # NEW: shared progress resolver
│   ├── run-status.ts                 # Unchanged (already extracted)
│   ├── time-factors.ts               # Unchanged
│   └── osrm.ts                       # Unchanged
├── app/api/routes/
│   ├── route.ts                      # Modified: use shared resolver
│   └── [routeId]/route.ts            # Modified: use shared resolver
├── types/index.ts                    # Unchanged (types already sufficient)
├── __tests__/tracking/
│   ├── eta.test.ts                   # Modified: add explicit-target test cases
│   ├── infer-stop-progress.test.ts   # Modified: add write-error test cases
│   ├── routes-api.test.ts            # Modified: add resolver + shadow mode tests
│   └── resolve-route-progress.test.ts # NEW: shared resolver unit tests
└── __tests__/components/
    ├── route-card-eta.test.ts        # NEW: UI regression tests for ETA gating
    └── route-detail-eta.test.ts      # NEW: UI regression tests for ETA gating
```

**Structure Decision**: All changes fit within existing `src/lib/tracking/` and `src/app/api/routes/` directories. One new source file (`resolve-route-progress.ts`), one new resolver test file, and two new UI regression test files. UI tests verify the `nextStop.id === progress.nextStopId` gating in `route-card.tsx` and `routes/[routeId]/page.tsx`.

## Complexity Tracking

No constitution violations to justify. All changes align with existing patterns.
