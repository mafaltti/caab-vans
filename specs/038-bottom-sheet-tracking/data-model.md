# Data Model: Bottom Sheet Tracking UI

**Date**: 2026-03-04
**Feature**: 038-bottom-sheet-tracking

## Overview

This feature introduces **no new database entities or API changes**. It is a purely frontend layout change that reuses existing data from the `useRouteDetail` hook.

## UI State (Client-Side Only)

### SheetSnapPoint

The active snap point of the bottom sheet. Managed as React state in the route detail page.

| Value | Height | Description |
|-------|--------|-------------|
| `0.25` | ~25% viewport | Peek — next stop, ETA chip, progress bar |
| `0.55` | ~55% viewport | Half — upcoming stops timeline visible |
| `0.92` | ~92% viewport | Full — complete timeline, past stops toggle |

**Default**: `0.25` (peek)

### MapViewportPadding

Derived from the active snap point. Not stored — computed on each snap change.

| Field | Type | Description |
|-------|------|-------------|
| top | number (px) | Header height (~80px including safe area) |
| bottom | number (px) | Sheet visible height at current snap |
| left | number (px) | Fixed at 40px |
| right | number (px) | Fixed at 40px |

### Layout Mode

Derived from existing route data. Not stored — computed from `RouteDetail`.

```ts
useBottomSheet = route.isRunning
  && route.van.lastLat != null
  && route.van.lastLng != null
```

- `true` → Bottom sheet layout (fullscreen map + sheet)
- `false` → Card layout (existing Option A)

## Existing Entities Used (No Changes)

### RouteDetail (from API)

Already provides all data needed for the bottom sheet:

- `nextStop.stopName` → peek section stop name
- `nextStop.time` → peek section scheduled time
- `progress.etaNextStopMinutes` → ETA chip value (null = hide chip)
- `progress.passedStopIds` → progress bar filled segments
- `progress.nextStopId` → progress bar current segment
- `schedule[]` → timeline items, progress bar total segments
- `van.lastLat/lastLng` → map markers (existing)
- `van.isLocationOutdated` → stale overlay (existing)

### Schedule Entry

Used to calculate progress bar segment count: `totalStops = schedule.length`.

Passed stops count: `passedCount = progress.passedStopIds.length`.
