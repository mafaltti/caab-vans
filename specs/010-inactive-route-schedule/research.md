# Research: Inactive Route Schedule Display

**Date**: 2026-02-28
**Status**: Complete — no unknowns to resolve

## Summary

This feature is a focused frontend UI change with no technical unknowns. All required data (`isRunning`) is already available in the API response and parent component. No new dependencies, patterns, or integrations are needed.

## Decisions

### D1: Stop status for inactive routes

- **Decision**: Add a `"neutral"` value to the existing `TimelineStopStatus` union type.
- **Rationale**: Reusing `"future"` was considered but rejected because it carries semantic meaning (upcoming stop on an active route). A dedicated `"neutral"` status makes the intent explicit and allows targeted styling without ambiguity.
- **Alternatives considered**:
  - Reuse `"future"` status — rejected because it conflates "stop hasn't happened yet on an active route" with "route is inactive, stops are reference-only."
  - Add a separate `isRunning` prop to `TimelineNode` — rejected because the status enum is the established pattern for driving node rendering.

### D2: Neutral stop visual style

- **Decision**: Use the same dot indicator as the existing `"future"` node (white background, zinc border, small gray dot) with standard-contrast text (`text-zinc-700`).
- **Rationale**: Consistent with the existing design system. The "future" node already represents a neutral, non-highlighted stop — reusing its visual style (not its semantic status) keeps the UI cohesive without adding new design tokens.
- **Alternatives considered**:
  - New distinct visual style — rejected as unnecessary (YAGNI). The existing future-node appearance already communicates "neutral/reference" effectively.

### D3: Collapsible bypass approach

- **Decision**: When `isRunning` is `false`, skip the past-stop filtering and collapsible button entirely. Show all stops directly.
- **Rationale**: The simplest approach — a single conditional check before the filtering logic. No state management changes needed.
- **Alternatives considered**:
  - Default `showPast` to `true` when inactive — works but leaves the conceptual "past" framing in place, which is misleading for inactive routes.
