# Implementation Plan: Reduce Polling Intervals

**Branch**: `034-reduce-polling-intervals` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/034-reduce-polling-intervals/spec.md`

## Summary

Reduce TanStack Query `refetchInterval` values across three query hooks to provide faster UI updates: routes and route detail from 15s to 5s, announcements from 60s to 30s. This is a configuration-only change touching three files with no data model, API, or behavioral changes.

## Technical Context

**Language/Version**: TypeScript ~5.x (Next.js App Router)
**Primary Dependencies**: TanStack Query (polling, caching, request dedupe)
**Storage**: N/A (no storage changes)
**Testing**: vitest
**Target Platform**: Mobile web (browser)
**Project Type**: Web application (Next.js)
**Performance Goals**: Route data visible within 5s of server availability; announcements within 30s
**Constraints**: No overlapping in-flight requests (handled by TanStack Query default behavior)
**Scale/Scope**: 3 files changed, 3 numeric constants updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Changing 3 constants — no simpler approach exists |
| II. Explicit Trade-offs | PASS | Trade-off: 3x route request volume for 3x fresher data. Justified by core product value (live tracking) |
| III. Branch & Merge Discipline | PASS | Working on feature branch `034-reduce-polling-intervals`, PR targets `dev` |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, tests before PR |
| V. Stack Constraints | PASS | Using TanStack Query as mandated; no new dependencies |
| Security Constraints | N/A | No auth/key/RLS changes |
| Timezone & Data Consistency | N/A | No time display changes |

## Project Structure

### Documentation (this feature)

```text
specs/034-reduce-polling-intervals/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no model changes)
├── quickstart.md        # Phase 1 output
└── spec.md              # Feature specification
```

### Source Code (files to modify)

```text
src/lib/queries/
├── use-routes.ts          # refetchInterval: 15_000 → 5_000
├── use-route-detail.ts    # refetchInterval: 15_000 → 5_000
└── use-announcements.ts   # refetchInterval: 60_000 → 30_000
```

**Structure Decision**: No new files or directories. Three existing query hooks are modified in-place.
