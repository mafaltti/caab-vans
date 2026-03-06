# Implementation Plan: Fix timeFactor Instability

**Branch**: `045-fix-timefactor-instability` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-fix-timefactor-instability/spec.md`

## Summary

The `timeFactor` multiplier used in ETA computation is volatile because `recentRuns` predictions use instantaneous GPS speed, which changes every API call. Replace with a fixed reference speed constant so the `actual / predicted` ratio only changes when a new stop is actually passed. Extract the duplicated recentRuns loop into a shared helper. Add minimum segment thresholds to filter noise.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Luxon (DateTime), existing haversine/time-factors/eta modules
**Storage**: N/A (no schema changes)
**Testing**: Vitest (unit tests for new helper and constants)
**Target Platform**: Next.js server runtime (Route Handlers)
**Project Type**: Web service (BFF layer)
**Performance Goals**: Zero additional network calls; computation-only change
**Constraints**: Must not degrade ETA accuracy; must be backward-compatible with existing logging

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | One-line constant replaces volatile speed lookup. Helper extraction justified by 2 identical copies that must stay in sync. No new abstractions beyond what's needed. |
| II. Explicit Trade-offs | PASS | PR will document: before/after of volatile vs stable ratio, extraction rationale (2 copies, identical logic, must diverge = extract). |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`. Conventional commit format. |
| IV. Quality Gates | PASS | Lint, type-check, build, tests will be run. |
| V. Stack Constraints | PASS | No new dependencies. Uses existing TypeScript, Luxon, Vitest stack. |
| Security Constraints | N/A | No auth, RLS, or key changes. |
| Timezone | N/A | No date/time display changes. |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies, no schema changes, no security surface changes.

## Project Structure

### Documentation (this feature)

```text
specs/045-fix-timefactor-instability/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
src/
├── lib/
│   └── tracking/
│       └── time-factors.ts    # Add constants + buildRecentRuns() helper
└── app/
    └── api/
        └── routes/
            ├── route.ts           # Replace inline loop with buildRecentRuns()
            └── [routeId]/
                └── route.ts       # Replace inline loop with buildRecentRuns()
```

**Structure Decision**: No new files. All changes fit within existing module boundaries. The `buildRecentRuns()` function naturally belongs in `time-factors.ts` alongside `computeRecentFactor` and `RecentRun`.
