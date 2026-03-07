# Implementation Plan: OSRM Configurable Timeouts

**Branch**: `050-osrm-configurable-timeouts` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/050-osrm-configurable-timeouts/spec.md`

## Summary

Replace hardcoded OSRM timeout values (50ms match, 100ms route) in `src/lib/tracking/osrm.ts` with environment-variable-configurable constants. Raise defaults to 200ms/300ms respectively. Add input validation with fallback to defaults for invalid values. Update `.env.local.example` with documentation.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js (Next.js App Router)
**Primary Dependencies**: Next.js, native `fetch` with `AbortController`
**Storage**: N/A (no schema changes)
**Testing**: Vitest (unit tests)
**Target Platform**: Linux VPS (Docker) / local dev
**Project Type**: Web service (BFF layer)
**Performance Goals**: OSRM calls should complete within configured timeout; no impact on API response time beyond the timeout ceiling
**Constraints**: Env vars parsed at module load via `parsePositiveInt` helper; no centralized config module exists (inline `process.env` access is the project pattern)
**Scale/Scope**: Single file change (`osrm.ts`) + env example + 1 test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. KISS | PASS | Minimal change: replace 2 hardcoded numbers with env-configurable constants. No new abstractions. |
| I. DRY | PASS | Parsing pattern used exactly twice (route + match) — below the 3-occurrence threshold for abstraction. Shared `parsePositiveInt` helper with `Number()` + validation is appropriate. |
| I. YAGNI | PASS | Only adding what Finding #5 requires. No metrics endpoint, no centralized config module, no retry logic. |
| II. Explicit Trade-offs | PASS | PR will show before/after of the 2 timeout lines. |
| III. Branch Discipline | PASS | Feature branch `050-osrm-configurable-timeouts`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be run. Unit test added for parsing logic. |
| V. Stack Constraints | PASS | No new dependencies. Uses existing patterns (process.env, parseInt). |
| Security | PASS | Timeout values are not secrets. No client exposure. |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/050-osrm-configurable-timeouts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no schema changes)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/lib/tracking/
└── osrm.ts              # Primary change: env-configurable timeouts (lines 19, 69)

src/__tests__/tracking/
└── osrm-timeouts.test.ts # New: unit test for timeout parsing & defaults

.env.local.example        # Add OSRM_ROUTE_TIMEOUT_MS and OSRM_MATCH_TIMEOUT_MS docs
```

**Structure Decision**: This is a surgical change to a single library file plus a test and env documentation. No new modules, directories, or abstractions needed.
