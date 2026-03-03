# Implementation Plan: Fix Stop Progress Backfill

**Branch**: `031-fix-stop-backfill` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/031-fix-stop-backfill/spec.md`

## Summary

Fix `inferStopProgress` to (1) match geofence hits to the closest-in-time occurrence when a stop repeats at the same coordinates, and (2) backfill all chronologically earlier pending stops as "passed" after any geofence match. Two changes to one function, no schema or API contract changes.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Supabase JS client, Luxon
**Storage**: PostgreSQL via Supabase (table: `route_run_stops`)
**Testing**: Vitest with mocked Supabase client
**Target Platform**: Node.js server (BFF route handler)
**Project Type**: Web service (BFF endpoint)
**Performance Goals**: Processing completes within existing GPS ping response cycle
**Constraints**: Single function change; no new DB migrations; no API signature changes
**Scale/Scope**: 2 files modified (`infer-stop-progress.ts` + test file)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Modifies one existing function; no new abstractions. Backfill is a single `.in()` query. |
| II. Explicit Trade-offs | PASS | PR will document: coordinate grouping replaces linear iteration (simpler correct behavior vs. slightly more code). |
| III. Branch & Merge Discipline | PASS | Feature branch `031-fix-stop-backfill` targeting `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, vitest must pass. New tests added for backfill + closest-in-time. |
| V. Stack Constraints | PASS | Uses existing stack (TypeScript, Supabase client, Luxon, Vitest). No new dependencies. |
| Security Constraints | PASS | No RLS or auth changes. Service-role-only access preserved. |
| Timezone & Data | PASS | All time comparisons use `nowBahia()` and `parseTime()` in America/Bahia. |

**Post-Phase 1 re-check**: PASS — no design decisions introduced new complexity or constraint violations.

## Project Structure

### Documentation (this feature)

```text
specs/031-fix-stop-backfill/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: entity analysis (no schema changes)
├── quickstart.md        # Phase 1: dev guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files touched)

```text
src/
└── lib/
    └── tracking/
        └── infer-stop-progress.ts   # Main logic change

src/
└── __tests__/
    └── tracking/
        └── infer-stop-progress.test.ts  # New + updated tests
```

**Structure Decision**: No new files or directories. Both changes are in existing files following the established project layout.

## Algorithm Design

### Current Flow (Step 6: Geofence Loop)

```
for each pending stop (time ASC):
  skip if coordKey in matchedCoords
  skip if now < stopTime - 30min
  if haversine(van, stop) <= radius:
    UPDATE stop → passed
    add coordKey to matchedCoords
```

**Problem**: Always picks earliest occurrence of a repeated coordinate.

### New Flow (Step 6: Closest-in-Time + Step 6b: Backfill)

```
Step 6 — Closest-in-time geofence matching:
  Group eligible pending stops by coordKey
  For each coordinate group:
    Check geofence once (all stops share same lat/lng)
    If match: pick the stop with smallest |time - now|
    Mark that stop as passed

Step 6b — Chronological backfill:
  Find max time among all newly-passed stops (geofence-matched)
  Collect IDs of pending stops with time < maxPassedTime
  Single UPDATE via .in("schedule_entry_id", ids) → passed
```

### Query Pattern for Backfill

```typescript
// Single batch update using .in() filter
const idsToBackfill = pendingStops
  .filter(s => s.schedule_entries.time < maxPassedTime)
  .filter(s => !newlyPassedIds.includes(s.schedule_entry_id))
  .map(s => s.schedule_entry_id);

if (idsToBackfill.length > 0) {
  await supabase
    .from("route_run_stops")
    .update({ status: "passed", passed_at: now })
    .eq("run_id", run.id)
    .in("schedule_entry_id", idsToBackfill);
}
```

## Complexity Tracking

> No constitution violations. Table left empty.
