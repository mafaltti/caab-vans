# Implementation Plan: Fix False "Atrasado" (Overdue) Status

**Branch**: `057-fix-false-atrasado` | **Date**: 2026-03-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/057-fix-false-atrasado/spec.md`

## Summary

The segment fallback ETA path marks stops as "overdue" based solely on whether the computed ETA is in the past, producing false "Atrasado" for early/on-time vans. The fix adds a schedule-time guard: overdue requires both the computed ETA **and** the scheduled stop time to have passed. The same guard is applied to the schedule fallback for consistency.

## Technical Context

**Language/Version**: TypeScript ~5.x
**Primary Dependencies**: Luxon (DateTime, parseTime utility)
**Storage**: N/A (no schema changes)
**Testing**: Vitest (existing suite at `src/__tests__/tracking/eta.test.ts`, ~1,746 lines)
**Target Platform**: Next.js server runtime (BFF)
**Project Type**: Web service (BFF layer)
**Performance Goals**: N/A (no performance change — one additional comparison per ETA computation)
**Constraints**: Luxon forced to `America/Bahia` timezone
**Scale/Scope**: 2 conditional checks modified in 1 file, regression tests added

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Minimal change — adds one condition to two existing `if` statements. No new abstractions. |
| II. Explicit Trade-offs in PRs | **PASS** | PR will include before/after snippets for the 2 modified lines. |
| III. Branch & Merge Discipline | **PASS** | Working on feature branch `057-fix-false-atrasado`, PR targets `dev`. |
| IV. Quality Gates | **PASS** | Lint, typecheck, build, tests will be verified. New regression tests added. |
| V. Stack Constraints | **PASS** | Uses existing Luxon `parseTime()`. Computation stays in BFF. |
| Timezone & Data Consistency | **PASS** | `parseTime()` already uses `America/Bahia`. `HH:mm` format preserved. |
| Security Constraints | **N/A** | No auth/key changes. |

## Project Structure

### Documentation (this feature)

```text
specs/057-fix-false-atrasado/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── tracking/
│   │   └── eta.ts           # Lines 279, 333 — overdue guard fix
│   └── time.ts              # parseTime() utility (no changes)
└── __tests__/
    └── tracking/
        └── eta.test.ts      # New regression tests for false-positive scenarios
```

**Structure Decision**: No new files or directories. Changes are confined to `eta.ts` (2 conditionals) and `eta.test.ts` (new test cases).
