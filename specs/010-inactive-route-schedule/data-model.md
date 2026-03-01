# Data Model: Inactive Route Schedule Display

**Date**: 2026-02-28
**Status**: Complete

## Summary

No database or API changes. This feature only modifies a client-side TypeScript type union and component props.

## Type Changes

### TimelineStopStatus (modified)

- **Location**: `src/types/index.ts`
- **Change**: Add `"neutral"` to the union type
- **Before**: `"past" | "current" | "future"`
- **After**: `"past" | "current" | "future" | "neutral"`
- **Purpose**: Represents a schedule stop on an inactive route — no past/current/future semantics, purely a reference time.

### ScheduleTimelineProps (modified)

- **Location**: `src/components/public/schedule-timeline.tsx`
- **Change**: Add `isRunning` boolean prop
- **Before**: `{ schedule, nextStopId }`
- **After**: `{ schedule, nextStopId, isRunning }`
- **Purpose**: Drives the display mode — when `false`, all stops render as `"neutral"` without the collapsible.

## Entity Relationships

No changes to database entities, API contracts, or server-side data structures.
