# Implementation Plan: Remove Dead Sequence Counter

**Branch**: `049-remove-dead-seq-counter` | **Date**: 2026-03-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/049-remove-dead-seq-counter/spec.md`

## Summary

Remove ~80 lines of dead sequence counter code (`currentSeq`, `resetSequence()`, `seq` field, gap detection logging) across the van-tracker app and the Next.js server. The `seq` field is also removed from the Zod validator and the database column + index are dropped via migration `00010_drop_seq_column.sql`.

## Technical Context

**Language/Version**: TypeScript ~5 (Next.js App Router + Expo/React Native)
**Primary Dependencies**: Next.js, Expo, Zod, Supabase JS client, AsyncStorage
**Storage**: PostgreSQL via Supabase (column + index dropped via migration `00010`)
**Testing**: Vitest (server-side unit tests)
**Target Platform**: Web server (Next.js) + Mobile (Expo Android/iOS)
**Project Type**: Web service + mobile app (monorepo)
**Performance Goals**: N/A (code removal only)
**Constraints**: Old tracker versions sending `seq` are not rejected (Zod v4 strips unknown keys)
**Scale/Scope**: ~80 lines removed across 7 files, zero new logic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Removing dead code is the purest application of YAGNI — code that serves no purpose is deleted. |
| II. Explicit Trade-offs in PRs | PASS | PR will state: "YAGNI — removing dead code with no consumers. DB column dropped via migration." |
| III. Branch & Merge Discipline | PASS | Feature branch `049-remove-dead-seq-counter` targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, and tests will be verified before PR. |
| V. Stack Constraints | PASS | No new dependencies or stack changes. Pure deletion. |
| Security Constraints | PASS | No security-sensitive code involved. |
| Timezone & Data | PASS | No time-related logic affected. |

**Post-design re-check**: No changes — this feature introduces no new design, only removes code.

## Project Structure

### Documentation (this feature)

```text
specs/049-remove-dead-seq-counter/
├── plan.md              # This file
├── research.md          # Phase 0: file inventory with exact line numbers
├── data-model.md        # Phase 1: minimal (column retention note)
├── quickstart.md        # Phase 1: removal steps
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
# Van-tracker app (Expo)
apps/van-tracker/src/
├── location/task.ts        # Remove: currentSeq, hydration, increment, resetSequence()
├── types.ts                # Remove: seq field from LocationPoint
└── api/client.ts           # Remove: seq from request bodies

# Next.js server
src/
├── app/api/
│   ├── tracking/[vanId]/route.ts    # Remove: seq destructuring, upsert field, gap detection
│   └── tracking-batch/[vanId]/route.ts  # Remove: seq upsert field
└── lib/validators/tracking.ts       # seq removed from schema

# Database
supabase/migrations/00010_drop_seq_column.sql  # Drops column + index
```

**Structure Decision**: No structural changes. All modifications are deletions within existing files.
