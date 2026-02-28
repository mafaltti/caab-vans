# Implementation Plan: Clean Time Format (Remove Seconds)

**Branch**: `007-clean-time-format` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-clean-time-format/spec.md`

## Summary

Remove seconds from all displayed schedule times by replacing ad-hoc `.slice(0, 5)` calls with a dedicated `formatTimeString` utility in `src/lib/time.ts`. PostgreSQL's `time` column returns `HH:MM:SS` format; this utility will consistently truncate to `HH:MM` across all 5 affected API endpoints (3 admin + 2 public).

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Luxon (date/time), Supabase JS client (data fetching), Zod (validation)
**Storage**: PostgreSQL via Supabase (self-hosted) — `time` column type returns `HH:MM:SS`
**Testing**: Vitest
**Target Platform**: Mobile web (responsive)
**Project Type**: Web application (Next.js with BFF)
**Performance Goals**: N/A — formatting-only change, no performance impact
**Constraints**: All times must use `America/Bahia` timezone, `HH:mm` display format
**Scale/Scope**: 5 API route files affected, 1 utility file modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Adding one small utility to replace 3 scattered `.slice(0,5)` calls + 2 unhandled pass-throughs. DRY: 5 identical operations consolidated into 1 function. |
| II. Explicit Trade-offs | PASS | Trade-off: adding a new function vs. keeping inline slicing. New function wins because it's already 5 call sites (>= 3 threshold). |
| III. Branch & Merge Discipline | PASS | Working on feature branch `007-clean-time-format`, PR will target `dev`. |
| IV. Quality Gates | PASS | Will run lint, type-check, build, and tests before PR. |
| V. Stack Constraints | PASS | Using Luxon for time operations, consistent with constitution mandate. No new dependencies. |
| Timezone & Data Consistency | PASS | All times remain in `America/Bahia`, `HH:mm` format — this change enforces the existing requirement. |
| Security Constraints | N/A | No auth/key changes. |

**Pre-design result: ALL GATES PASS**

## Project Structure

### Documentation (this feature)

```text
specs/007-clean-time-format/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no new entities)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contract changes)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (affected files)

```text
src/
├── lib/
│   └── time.ts                              # Add formatTimeString utility
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── route.ts                     # Apply formatTimeString to schedule entries
│   │   │   └── [routeId]/
│   │   │       └── route.ts                 # Apply formatTimeString to schedule entries
│   │   └── admin/
│   │       └── routes/
│   │           └── [routeId]/
│   │               ├── schedule/
│   │               │   └── route.ts         # Replace .slice(0,5) with formatTimeString
│   │               └── schedule/
│   │                   └── [entryId]/
│   │                       └── route.ts     # Replace .slice(0,5) with formatTimeString
```

**Structure Decision**: No structural changes. All modifications are within existing files. One new exported function added to the existing `src/lib/time.ts` utility module.
