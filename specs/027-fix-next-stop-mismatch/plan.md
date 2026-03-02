# Implementation Plan: Fix Next Stop Mismatch

**Branch**: `027-fix-next-stop-mismatch` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-fix-next-stop-mismatch/spec.md`

## Summary

When a route run is active, the displayed "next stop" on route cards and hero cards diverges from the ETA engine's next stop because they use different computation sources. The fix unifies the next stop source at the API data assembly layer: when `progress.nextStopId` exists and the route `isRunning`, the API overrides the time-based `nextStop` with the tracking-based stop. No changes to `computeEta`, `getNextStop`, or UI components.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Next.js 16, Supabase JS, Luxon
**Storage**: Supabase Postgres (self-hosted)
**Testing**: Vitest
**Target Platform**: Web (mobile-first)
**Project Type**: Web service (BFF + frontend)
**Performance Goals**: N/A (bug fix, no performance change)
**Constraints**: Fix must be at BFF layer only (constitution: computed fields in BFF)
**Scale/Scope**: 2 API route files changed, 0 component files changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change — override logic added once per route handler. No new abstractions; 2 occurrences is below the 3-repetition threshold for extraction. |
| II. Explicit Trade-offs | PASS | Trade-off: we chose to unify at data layer rather than auto-advancing stops (which would falsify data) or removing guards (which would show wrong ETAs). |
| III. Branch & Merge Discipline | PASS | Feature branch `027-fix-next-stop-mismatch` from `dev`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be run. New test added for the override scenario. |
| V. Stack Constraints | PASS | Computed fields stay in BFF. No Edge Functions. Luxon for time. |
| Timezone | PASS | No timezone changes. All time operations already use America/Bahia. |
| Security | PASS | No new data exposed. Service role key usage unchanged. |

## Project Structure

### Documentation (this feature)

```text
specs/027-fix-next-stop-mismatch/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files affected)

```text
src/
├── app/api/routes/
│   ├── route.ts              # Route list API — add override logic
│   └── [routeId]/route.ts    # Route detail API — add override logic (mirror)
└── __tests__/tracking/
    └── eta.test.ts            # Existing tests (unchanged, no breakage)
```

## Complexity Tracking

No constitution violations. Table not needed.

## Design

### Approach

After the `progress` block is computed in each API route handler, add a resolution step:

1. Check if `isRunning && progress?.nextStopId` exists
2. Find the matching schedule entry by ID in `sortedEntries`
3. Override `nextStop` with that entry's `stopName` and `time`
4. Recalculate `currentStopIndex` from the resolved stop's position
5. Use the resolved values in the JSON response

This ensures `nextStop.id === progress.nextStopId` naturally, so the existing UI guard conditions pass without component changes.

### Key Observations from Code Review

1. **Route list handler** (`src/app/api/routes/route.ts`): Uses `runStatus === "idle"` to null out progress. The override must only apply when progress is non-null.
2. **Route detail handler** (`src/app/api/routes/[routeId]/route.ts`): Uses `runStatus === "completed"` to null out progress. Same guard applies.
3. **Both handlers** compute `nextStop`, `currentStopIndex`, and `nextStopEntry` before the progress block. The override must happen after progress is computed.
4. The `sortedEntries` array contains the `id` field needed to match `progress.nextStopId`.

### Change Pattern (identical in both files)

```
// After progress computation, before building the response:
// Resolve nextStop from progress when tracking is active
let resolvedNextStop = nextStop;
let resolvedStopIndex = currentStopIndex;
if (isRunning && progress?.nextStopId) {
  const trackingEntry = sortedEntries.find(e => e.id === progress.nextStopId);
  if (trackingEntry) {
    resolvedNextStop = {
      stopName: trackingEntry.stop_name,
      time: formatTimeString(trackingEntry.time),
    };
    const idx = sortedEntries.indexOf(trackingEntry);
    resolvedStopIndex = idx !== -1 ? idx : currentStopIndex;
  }
}
// Use resolvedNextStop and resolvedStopIndex in the response
```

### What Does NOT Change

- `src/lib/time.ts` — `getNextStop` remains as fallback for non-tracked routes
- `src/lib/tracking/eta.ts` — `computeEta` is already correct
- `src/components/public/route-card.tsx` — Guard naturally passes now
- `src/components/public/hero-card.tsx` — No changes
- `src/app/(public)/routes/[routeId]/page.tsx` — Guard naturally passes now
- `src/components/public/schedule-timeline.tsx` — Already uses `progress.nextStopId`
