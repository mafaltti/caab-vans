# Implementation Plan: Progress Pointer Correctness Fixes

**Branch**: `053-progress-pointer-fixes` | **Date**: 2026-03-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/053-progress-pointer-fixes/spec.md`

## Summary

Fix 7 correctness gaps identified in the Phase 2 progress pointer gap analysis (doc 0086). Three P1 fixes address ETA disappearing for late routes: multi-segment distance accumulation in `eta.ts`, flipping the default progress source to `persisted`, and a two-tier pointer staleness model (30-min fresh / 2-hour ceiling). Three P2 fixes improve inference accuracy: per-stop snap evaluation, confidence source alignment, and tighter backfill gating. One P3 adds opt-in last-known progress for non-active runs.

All changes are behavior-only — no database migrations, no new dependencies, no UI changes. The work touches 3 core tracking modules (`eta.ts`, `resolve-route-progress.ts`, `infer-stop-progress.ts`), 1 constant file (`time.ts`), and 2 API route handlers.

## Technical Context

**Language/Version**: TypeScript ~5, Node.js 20+
**Primary Dependencies**: Next.js 16 (App Router), Luxon, Zod, Supabase JS client
**Storage**: PostgreSQL via Supabase (no schema changes)
**Testing**: Vitest (unit tests with mocked Supabase)
**Target Platform**: Linux VPS (Next.js server runtime)
**Project Type**: Web service (BFF layer)
**Performance Goals**: No regression — progress resolution must complete within existing time bounds
**Constraints**: Canonical timezone `America/Bahia`; all ETA in `HH:mm` format for passengers
**Scale/Scope**: ~5 van routes, 5-15 stops per route, polling every few seconds

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity (KISS/DRY/YAGNI)** | PASS | All changes modify existing logic; no new abstractions. One new constant (`POINTER_ABSOLUTE_CEILING_MINUTES`). Per-stop snap adds one extra haversine call per stop — minimal overhead. |
| **II. Explicit Trade-offs** | PASS | Research.md documents 7 decisions with rationale and rejected alternatives. PR will reference these. |
| **III. Branch & Merge Discipline** | PASS | Feature branch `053-progress-pointer-fixes` targets `dev`. |
| **IV. Quality Gates** | PASS | All changes covered by existing + new unit tests. Lint, typecheck, build must pass. |
| **V. Stack Constraints** | PASS | No new dependencies. Uses Luxon for time, Zod for validation, existing Supabase patterns. BFF-only changes. |
| **Security Constraints** | PASS | No auth changes. `includeLastKnown` query param is public-safe (same data, just not suppressed). |
| **Timezone & Data Consistency** | PASS | All time operations use Luxon in `America/Bahia`. No format changes. |

**Post-Phase 1 Re-check**: PASS — no new entities, no schema changes, no new dependencies introduced.

## Project Structure

### Documentation (this feature)

```text
specs/053-progress-pointer-fixes/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: decisions and code analysis
├── data-model.md        # Phase 1: entity reference (no schema changes)
├── quickstart.md        # Phase 1: developer setup
├── contracts/
│   └── route-progress-api.md  # Phase 1: API contract changes
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── tracking/
│   │   ├── eta.ts                      # FR-001, FR-005, FR-010
│   │   ├── resolve-route-progress.ts   # FR-002, FR-003, FR-004, FR-009
│   │   ├── infer-stop-progress.ts      # FR-006, FR-007, FR-008
│   │   └── haversine.ts                # (no changes, used by FR-006)
│   └── time.ts                         # New constant: POINTER_ABSOLUTE_CEILING_MINUTES
├── app/api/routes/
│   ├── route.ts                        # FR-009 (includeLastKnown param)
│   └── [routeId]/
│       └── route.ts                    # FR-009 (includeLastKnown param)
└── __tests__/tracking/
    ├── eta.test.ts                     # New: multi-segment, route-order fallback
    ├── resolve-route-progress-modes.test.ts  # Updated: default=persisted, 2-tier staleness
    ├── resolve-route-progress.test.ts  # Updated: ceiling, includeLastKnown
    └── infer-stop-progress.test.ts     # Updated: per-stop snap, confidence, backfill
```

**Structure Decision**: Existing Next.js App Router monorepo. All changes are in the BFF tracking layer (`src/lib/tracking/`) and its API route handlers. No new directories needed.

## Implementation Phases

### Phase A: P1 Fixes (Core ETA Correctness)

**Goal**: Ensure late-running routes always show a valid ETA.

#### A1. Multi-Segment Distance Accumulation (FR-001, FR-010)

**File**: `src/lib/tracking/eta.ts` (lines 237-260)

**Change**: Replace single-segment lookup with a loop that sums `osrmDistanceM` from the last-passed stop through all intermediate stops to the target. If any intermediate segment has null `osrmDistanceM`, fall back entirely to `scheduleDelayFallback`.

**Algorithm**:
1. Find index of `lastPassedForSegment` in the stops array (sorted by schedule order).
2. Iterate from `lastPassedIndex` to the stop before `nextStop` (the target).
3. Sum each stop's `osrmDistanceM`. If any is null, break and use schedule fallback.
4. Use accumulated distance in the existing travel-time formula.

**Tests**: Add cases for 2-stop gap, 3-stop gap, partial segment data (null in middle → schedule fallback), and single-stop (existing behavior preserved).

#### A2. Default Progress Source Flip (FR-002, FR-003)

**File**: `src/lib/tracking/resolve-route-progress.ts` (line 272)

**Change**: `return "legacy"` → `return "persisted"`. One-line change.

**Tests**: Update the "default env var undefined" test to expect `persisted` mode. Add explicit `TRACKING_PROGRESS_SOURCE=legacy` test to verify opt-in backward compatibility.

#### A3. Two-Tier Pointer Staleness (FR-004, FR-005)

**Files**: `src/lib/time.ts`, `src/lib/tracking/resolve-route-progress.ts` (lines 168-185)

**Changes**:
1. Add `POINTER_ABSOLUTE_CEILING_MINUTES = 120` to `time.ts`.
2. Modify pointer validation in `resolve-route-progress.ts`:
   - Keep `pointerFresh` check (age < 30 min) for logging/shadow purposes.
   - Add `pointerWithinCeiling` check (age < 120 min).
   - Use pointer if `pointerExists && pointerIsPending && pointerWithinCeiling`.
   - Log different reasons: `"pointer_fresh"`, `"pointer_stale_but_valid"`, `"pointer_expired"`.

3. Route-order fallback in `eta.ts` (lines 80-103): When no `targetStopId` is provided and time-floor filtering yields no stops, fall back to first pending stop by schedule order instead of returning null.

**Tests**: Add cases for pointer at 35 min (stale but valid), 119 min (still valid), 121 min (expired), and time-floor fallback to route order.

### Phase B: P2 Fixes (Inference Accuracy)

**Goal**: Improve stop-passage detection accuracy for mixed-terrain routes.

#### B1. Per-Stop Snap Evaluation (FR-006)

**File**: `src/lib/tracking/infer-stop-progress.ts` (lines 148-163, 196-201)

**Change**: Move snap decision inside the per-stop geofence loop. For each candidate stop:
1. Compute `rawDist = haversineDistanceMeters(lat, lng, stop.stop_lat, stop.stop_lng)`.
2. If snapped coordinates exist and snap displacement ≤ 50m, compute `snappedDist = haversineDistanceMeters(snappedLat, snappedLng, stop.stop_lat, stop.stop_lng)`.
3. Use whichever is shorter. Track `useSnappedForThisStop` per stop.
4. Pass per-stop snap decision to confidence calculation and pass_source labeling.

**Tests**: Add case with two stops: one where snapped is closer, another where raw is closer. Verify each gets the appropriate coordinate source and pass_source label.

#### B2. Confidence Source Alignment (FR-007)

**File**: `src/lib/tracking/infer-stop-progress.ts` (lines 236-261)

**Change**: When the per-stop snap decision (B1) used snapped coordinates for a passage, compute confidence using snapped coordinates for the recent-ping distance check. Since `van_location_pings` stores raw coordinates, compute the snapped equivalent for each recent ping (use the same snap displacement check: if the ping's raw-to-snapped displacement ≤ 50m, use snapped; otherwise raw).

**Simplified alternative** (if the above is too complex): Keep using raw pings for confidence but cap snapped-passage confidence at 0.8 instead of 1.0, explicitly documenting that raw pings are a conservative evidence bar. This removes the false "high confidence" for snapped passages without needing to snap historical pings.

**Recommended approach**: The simplified alternative. It's a one-line change (confidence cap) vs. a complex ping-snapping pipeline. Aligns with KISS.

**Tests**: Update confidence test for snapped passage with 2+ raw pings: expect 0.8 (not 1.0). Add test documenting the rationale.

#### B3. Backfill Gate Tightening (FR-008)

**File**: `src/lib/tracking/infer-stop-progress.ts` (line 318)

**Change**: `const shouldBackfill = maxPassedConfidence > 0.7 || gap <= 1;` → `const shouldBackfill = maxPassedConfidence > 0.7;`

Remove the `gap <= 1` unconditional exception. Single-stop backfill now requires the same evidence bar as multi-stop.

**Tests**: Update "single ping DOES backfill for 1-stop gap" test to expect NO backfill. Add test confirming 2-ping (confidence 0.9) still backfills gap=1.

### Phase C: P3 Enhancement (Non-Active Run Progress)

**Goal**: Optionally expose last-known progress for completed/paused runs.

#### C1. includeLastKnown Parameter (FR-009)

**Files**: `src/lib/tracking/resolve-route-progress.ts` (lines 81-93), `src/app/api/routes/route.ts`, `src/app/api/routes/[routeId]/route.ts`

**Changes**:
1. Add `includeLastKnown?: boolean` to `resolveRouteProgress` args.
2. In the early-return block for completed/idle/waiting: if `includeLastKnown` is true, skip the early return and compute progress normally.
3. In both API route handlers: parse `includeLastKnown` from `request.nextUrl.searchParams` and pass to `resolveRouteProgress`.

**Tests**: Add tests for completed run with `includeLastKnown=true` (returns progress) and without (returns null, existing behavior).

## Complexity Tracking

No constitution violations. All changes are minimal modifications to existing logic with no new abstractions, dependencies, or architectural patterns.
