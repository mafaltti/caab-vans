# Implementation Plan: Fix ETA Segment Distance After Stop Skip

**Branch**: `073-fix-eta-segment-skip` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/073-fix-eta-segment-skip/spec.md`

## Summary

Fix two bugs in the segment-based ETA computation:

1. **Wrong distance after skips**: When skipped stops are filtered out before `computeEta()`, the segment accumulation loop reads `osrmDistanceM` values that still reference the original (now-skipped) neighbor. Fix: include skipped stops in the array so distances sum correctly through intermediate stops.
2. **False 0 min display**: When segment ETA falls in the past but scheduled time is still future, the overdue guard doesn't trigger and the result clamps to 0 min. Fix: fall through to schedule-based fallback instead of returning a misleading "estimated" result.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 App Router)
**Primary Dependencies**: Luxon (date/time), Vitest (testing)
**Storage**: Supabase Postgres (`schedule_entries.osrm_distance_m`)
**Testing**: Vitest — existing test suite at `src/__tests__/tracking/eta.test.ts`
**Target Platform**: Server-side (BFF layer, Next.js Route Handlers)
**Project Type**: Web service (BFF computed field)
**Performance Goals**: N/A — bug fix on existing computation path, no new I/O
**Constraints**: No new external API calls; sum existing stored distances
**Scale/Scope**: 2 files changed, ~15 lines modified, ~50 lines of new tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal diff — no new abstractions, no new dependencies |
| II. Explicit Trade-offs | PASS | Trade-off: summing stored distances vs. fresh OSRM call (chose sum — no new I/O, correct for sequential routes) |
| III. Branch & Merge | PASS | Feature branch `073-fix-eta-segment-skip`, PR targets `dev` |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be run before PR |
| V. Stack Constraints | PASS | Uses existing stack (Luxon, TypeScript, Vitest). Computed field stays in BFF |
| Timezone & Data | PASS | No timezone changes. ETA display format unchanged |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/073-fix-eta-segment-skip/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched)

```text
src/
├── lib/
│   └── tracking/
│       ├── eta.ts                    # Bug 1: Stop type union + Bug 2: fallback logic
│       └── resolve-route-progress.ts # Bug 1: stop filter change
└── __tests__/
    └── tracking/
        └── eta.test.ts               # New test cases for both bugs
```

**Structure Decision**: This is a targeted bug fix touching 2 source files in the existing `src/lib/tracking/` module and the existing test file. No new files, directories, or abstractions needed.

## Design

### Bug 1: Segment Distance Wrong After Skips

**Root cause**: `resolve-route-progress.ts:294` filters skipped stops before passing to `computeEta()`. The segment accumulation loop (`eta.ts:283-289`) iterates through the filtered array, but each stop's `osrmDistanceM` still references its original sequential neighbor — creating a distance gap.

**Fix approach — include skipped stops in the array**:

1. **`eta.ts`** — Expand the `Stop` interface status union from `"pending" | "passed"` to `"pending" | "passed" | "skipped"`.

2. **`resolve-route-progress.ts`** — Remove the `.filter((rs) => rs.status !== "skipped")` at line 294. Include skipped stops in the array with `status: "skipped"`.

3. **No other changes needed** because:
   - `passed = stops.filter(s => s.status === "passed")` — skipped stops excluded (correct)
   - `pending = stops.filter(s => s.status === "pending")` — skipped stops excluded (correct, they're not targets)
   - `sortedAllForSegment = [...stops]` — skipped stops included (correct, distances sum through them)
   - GPS branch operates on `nextStop` (a pending stop) — not affected
   - `scheduleDelayFallback` filters passed stops — not affected

**Why this works**: The segment loop iterates stops by sorted sequence index. With skipped stops present:
- Before: `[#13(passed)] → osrmDistanceM = 1141m (to #14)` → total = 1141m (wrong)
- After: `[#13(passed), #14(skipped), #15(pending)]` → `dist(#13→#14) + dist(#14→#15)` → total = correct sum

### Bug 2: 0 min Instead of Schedule Fallback

**Root cause**: `eta.ts:302-314` — When `etaDateTime <= now` (segment ETA in past) but `scheduledTime > now` (schedule still future), the overdue guard doesn't trigger. The code falls through to `Math.max(0, ...)` which clamps to 0 and returns `"estimated"`.

**Fix approach — fall through to schedule fallback**:

At `eta.ts:302`, add an `else if` for the case where segment ETA is in the past but scheduled time is still future. Instead of continuing to the clamp-to-zero return, fall through to `scheduleDelayFallback()`.

```
if (etaDateTime <= now && scheduledTime <= now) {
  // Both past → overdue (existing behavior, unchanged)
  return { ... etaStatus: "overdue" };
} else if (etaDateTime <= now) {
  // Segment ETA past but schedule still future → fall through to schedule
  return scheduleDelayFallback(stops, passed, nextStop, nextStopId, passedStopIds, now);
}
// Segment ETA in future → use as-is (existing behavior, unchanged)
```

### Rejected alternative: Fresh OSRM call for skip gaps

Instead of summing stored distances, we could make a fresh OSRM API call from the last-passed stop to the next pending stop. Rejected because:
- Adds network I/O to a path that currently has none (segment branch is a fast fallback)
- The van follows the sequential route anyway — summing stored segment distances gives the correct along-route distance
- OSRM may not be available (optional dependency)

### Regression safety (FR-006)

When no stops are skipped, the array is identical to before — all stops have status `"passed"` or `"pending"`. The segment loop behavior is unchanged. This is verified by existing passing tests (multi-segment T002-T005).
