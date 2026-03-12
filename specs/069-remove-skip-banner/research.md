# Research: Remove Misleading Skipped-Stop Warning Banner

**Branch**: `069-remove-skip-banner` | **Date**: 2026-03-12

## Summary

No research needed. This is a straightforward UI removal with no unknowns.

## Findings

### Decision: Remove skipped-stop banner entirely (not refine it)

**Rationale**: The ETA engine (`src/lib/tracking/eta.ts`) already filters out skipped stops before computing ETAs. The GPS-based and segment-based strategies recalculate from the van's live position, so skipped stops have zero impact on ETA accuracy. Showing a warning banner is misleading and causes unnecessary anxiety for commuters.

**Alternatives considered**:
- **Make the banner more specific** (e.g., "Parada X foi pulada"): Rejected — skipped stops are already visually marked in the ScheduleTimeline, making a separate banner redundant.
- **Keep banner only briefly**: Rejected — adds complexity (timers, state) for no user value.

### Scope confirmation

- **2 source files affected**: `page.tsx` (route detail) and `route-card.tsx` (route list card).
- **No backend changes**: The `hasSkippedStops` and `skippedStopIds` fields remain in the API response — they're still consumed by the ScheduleTimeline for visual marking.
- **No test files to update**: No existing tests assert the presence of this banner.
