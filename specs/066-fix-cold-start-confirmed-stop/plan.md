# Implementation Plan: Fix Cold-Start Confirmed Stop Stuck Pending

**Branch**: `066-fix-cold-start-confirmed-stop` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/066-fix-cold-start-confirmed-stop/spec.md`

## Summary

When a driver confirms their current stop during a mid-route cold start, the confirmed stop stays `pending` because no geofence enter event fires (the van is already inside the geofence). This blocks the head-of-line guard, freezing all subsequent stop progression for the day.

**Fix**: Change the confirm-start-stop endpoint to include the confirmed stop in the bulk-mark operation (`seq <= confirmedStopSequence` instead of `seq < confirmedStopSequence`), and update the idempotency check to match the new behavior.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 App Router)
**Primary Dependencies**: Next.js, Supabase client, Luxon, Zod
**Storage**: Supabase (Postgres) — `route_run_stops`, `route_runs` tables
**Testing**: Vitest
**Target Platform**: Linux VPS (server-side route handler)
**Project Type**: Web service (BFF API endpoint)
**Performance Goals**: N/A (same request cycle, no new queries)
**Constraints**: Single endpoint change; no UI, no new dependencies
**Scale/Scope**: 1 file change + test updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | One-line filter change (`<` → `<=`) plus idempotency guard update. No new abstractions. |
| II. Explicit Trade-offs in PRs | PASS | PR will document the behavioral change and its rationale. |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`. Conventional commit. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will pass. Test updates included. |
| V. Stack Constraints | PASS | No new tech. Uses existing Supabase client, Luxon, Zod. |
| Security Constraints | PASS | No auth changes. Service-role key stays server-only. |
| Timezone & Data Consistency | PASS | No time display changes. Uses existing `passed_at` timestamp. |

## Project Structure

### Documentation (this feature)

```text
specs/066-fix-cold-start-confirmed-stop/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/app/api/routes/[routeId]/confirm-start-stop/
└── route.ts                    # PRIMARY: bulk-mark filter + idempotency check

src/__tests__/lib/tracking/
└── confirm-start-stop.test.ts  # Test updates for new behavior
```

**Structure Decision**: No new files. Two existing files modified.

## Change Analysis

### 1. Bulk-mark filter (line 163)

**Current**: `return seq < confirmedStopSequence && s.status === "pending";`
**New**: `return seq <= confirmedStopSequence && s.status === "pending";`

This includes the confirmed stop in the set of stops marked as `passed`. The rest of the bulk-mark logic (pass_source, pass_confidence, passed_at) applies identically.

### 2. Idempotency check (lines 108-129)

**Current**: Checks `run.next_stop_id === stopId` — after the old behavior, next_stop_id pointed to the confirmed stop.

**New**: After the fix, next_stop_id points to the stop **after** the confirmed one. The idempotency check must detect that the confirmed stop is already `passed` with `pass_source='manual'`.

**New logic**: Check `targetStop.status === 'passed' && targetStop.pass_source === 'manual'` and all other passed stops are also `manual`.

### 3. Response passedCount (line 199)

**Current**: `passedCount: priorStopIds.length` — only counted prior stops.
**New**: Same code, but `priorStopIds` now includes the confirmed stop (due to `<=`), so count is automatically correct.

### 4. Tests

Update existing tests to reflect the new behavior:
- Happy path: confirmed stop is now in the passed set, nextStopId is the stop after.
- Idempotency: retry detection uses confirmed stop's passed status, not next_stop_id matching.
- Add edge case: confirming the last stop → all passed, next_stop_id = null.
- Add edge case: confirming the first stop → only it is passed, next_stop_id = stop #2.
