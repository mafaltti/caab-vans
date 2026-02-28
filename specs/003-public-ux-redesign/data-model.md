# Data Model: Public Screens UX Redesign

**Branch**: `003-public-ux-redesign` | **Date**: 2026-02-28

## Overview

This redesign is primarily visual — no database schema changes are needed. The data model changes are limited to:
1. Two new computed fields in the routes list BFF response
2. One new client-side derived type for timeline rendering

---

## Existing Entities (No Changes)

### Route (Database)
- `id`: UUID (PK)
- `name`: string
- `van_id`: UUID (FK → Van)
- Schedule entries via `schedule_entries` relation

### Schedule Entry (Database)
- `id`: UUID (PK)
- `route_id`: UUID (FK → Route)
- `stop_name`: string
- `time`: string (HH:mm)

### Announcement (Database)
- `id`: UUID (PK)
- `title`: string
- `body`: string
- `is_pinned`: boolean
- `is_urgent`: boolean
- `expires_at`: timestamp | null
- `created_at`: timestamp

### Van (Database)
- `id`: UUID (PK)
- `name`: string
- `location_url`: string | null
- `location_updated_at`: timestamp | null

---

## BFF Response Changes

### RouteWithStatus (Updated)

**New fields** (additive, non-breaking):

| Field              | Type            | Source                  | Description                                    |
|--------------------|-----------------|-------------------------|------------------------------------------------|
| `totalStops`       | `number`        | `schedule_entries.length` | Total number of stops in the route's schedule  |
| `currentStopIndex` | `number \| null` | Derived from `nextStop` | 0-based index of the current/next stop, or null if schedule ended |

**Updated TypeScript type**:
```typescript
export type RouteWithStatus = {
  id: string;
  name: string;
  isRunning: boolean;
  nextStop: NextStop | null;
  scheduleStatus: ScheduleStatus;
  totalStops: number;         // NEW
  currentStopIndex: number | null;  // NEW
  van: {
    id: string;
    locationUrl: string | null;
    locationUpdatedAt: string | null;
    isLocationOutdated: boolean;
  };
};
```

**Computation logic** (in BFF):
- `totalStops` = count of schedule entries for the route
- `currentStopIndex` = index of the entry matching `nextStop.time` in the sorted schedule, or `null` if no next stop

---

## Client-Side Derived Types (New)

### TimelineStop

Derived from existing `schedule` array + `nextStop` in the route detail response. Computed in the timeline component, not stored or returned by API.

```typescript
export type TimelineStopStatus = "past" | "current" | "future";

export type TimelineStop = {
  id: string;
  stopName: string;
  time: string;          // HH:mm
  status: TimelineStopStatus;
};
```

**Derivation logic** (client-side):
- Find the index of `nextStop` in the schedule by matching `time`
- All entries before that index → `past`
- The entry at that index → `current`
- All entries after that index → `future`
- If `nextStop` is null (schedule ended) → all entries are `past`

---

## Entity Relationships (Unchanged)

```
Van (1) ←→ (N) Route
Route (1) ←→ (N) ScheduleEntry
Announcement (standalone, no FK relations)
```

---

## State Transitions

### Route Operational Status
```
not_started → active → ended
     ↑                    |
     └────────────────────┘  (next day)
```
- Determined by current time vs schedule window + location freshness
- No change to existing logic

### Announcement Lifecycle
```
created → [pinned/unpinned] → expired (when expires_at < now)
```
- Urgent flag is static (set at creation)
- No change to existing logic
