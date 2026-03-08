# Implementation Plan: Gate Stop-Progress Inference by Active Shift

**Branch**: `048-gate-stop-inference` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/048-gate-stop-inference/spec.md`

## Summary

Add a shift-existence check to `inferStopProgress()` so stops are only seeded and marked as "passed" when a driver has an active `route_shifts` record (`ended_at IS NULL`). This prevents phantom stop marking from overnight parking, pre-shift device testing, and midnight buffer flushes. Single file change (~10 lines) with no schema migrations.

## Technical Context

**Language/Version**: TypeScript ~5.x
**Primary Dependencies**: Supabase JS client (server-side, service role)
**Storage**: PostgreSQL via Supabase (existing `route_shifts` table)
**Testing**: Vitest 4.0.18 (existing test suite with mock Supabase factory)
**Target Platform**: Next.js server runtime (Route Handlers)
**Project Type**: Web service (BFF layer)
**Performance Goals**: +1 lightweight indexed query per GPS ping (~sub-ms)
**Constraints**: No schema changes, no new dependencies, no call site changes
**Scale/Scope**: 10-50 vans, 1 query added per ping processing cycle

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | ~10 lines added to 1 file. No new abstractions. Uses existing table/pattern. |
| II. Explicit Trade-offs | PASS | Minimal diff. Trade-off: 1 extra DB query per ping vs. data correctness. |
| III. Branch & Merge Discipline | PASS | Feature branch `048-gate-stop-inference`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, type-check, build, tests will all be verified. |
| V. Stack Constraints | PASS | Uses existing Supabase client, TypeScript, Vitest. No new stack. |
| Security Constraints | PASS | Service role key used server-side only (existing pattern). |
| Timezone | N/A | No time display changes. |

**Post-design re-check**: All gates still PASS. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/048-gate-stop-inference/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no schema changes)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files touched)

```text
src/
└── lib/
    └── tracking/
        └── infer-stop-progress.ts    # Add shift gate (~10 lines)

src/
└── __tests__/
    └── tracking/
        └── infer-stop-progress.test.ts  # Add 3 test cases
```

**Structure Decision**: No new files or directories. Changes confined to existing module and its test file.

## Complexity Tracking

No constitution violations. Table not needed.
