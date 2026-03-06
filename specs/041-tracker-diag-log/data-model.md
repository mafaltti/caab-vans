# Data Model: Tracker Diagnostic Log

**Feature**: 041-tracker-diag-log
**Date**: 2026-03-06

## Entities

### MinuteSummary

Aggregated tracker activity counts for a single calendar minute.

| Field | Type    | Description                                     |
|-------|---------|-------------------------------------------------|
| type  | literal | Always `"summary"` — discriminator for union    |
| t     | number  | Minute start timestamp (floored to 60s boundary) |
| ok    | number  | Successful sends count                           |
| fail  | number  | Failed sends count                               |
| buf   | number  | Buffered (offline/retry) count                   |
| thr   | number  | Throttled (stationary/too-close) count            |
| flt   | number  | Filtered (accuracy/duplicate/stale) count         |
| cb    | number  | Task callback invocations (proves task alive)     |

**Identity**: Unique by `t` (one summary per minute).
**Lifecycle**: Created when first counter increments in a new minute. Finalized and staged for disk when the next minute begins. Immutable once flushed.

### EventEntry

Timestamped record of a state change or error.

| Field | Type      | Description                              |
|-------|-----------|------------------------------------------|
| type  | literal   | Always `"event"` — discriminator         |
| t     | number    | `Date.now()` timestamp                   |
| e     | EventType | Event category (see enum below)          |
| d     | string?   | Optional detail text (max 80 characters) |

**Identity**: No uniqueness constraint; multiple events can share a timestamp.
**Lifecycle**: Created on occurrence, immutable once written.

### EventType (enum)

| Value            | Trigger                                    |
|------------------|--------------------------------------------|
| tracking_start   | Driver pressed Start                       |
| tracking_stop    | Driver pressed Stop                        |
| cold_start       | Task hydrated state from storage           |
| task_error       | TaskManager reported an error              |
| flush            | Buffer flush started or completed          |
| buffer_full      | Buffer overflow — data loss                |
| network_down     | Connectivity lost (first occurrence)       |
| network_up       | Connectivity restored                      |
| error            | Server error, auth error, unexpected error |
| state_change     | Moving <-> stationary transition           |

### LogEntry (union)

```
LogEntry = MinuteSummary | EventEntry
```

Discriminated by the `type` field (`"summary"` | `"event"`).

### DiagnosticLog (aggregate)

| Property     | Value                                  |
|--------------|----------------------------------------|
| Storage key  | `@diagLog`                             |
| Format       | JSON array of LogEntry                 |
| Max entries  | 1,100                                  |
| Eviction     | Drop oldest entries when over capacity |
| Approx. size | ~75KB for 15 hours                     |

## State Diagram

```
[App Start]
    |
    v
[No Log] ---(first counter/event)---> [Accumulating]
    ^                                       |
    |                                       v
[Cleared] <---(clearLog())--- [Accumulating] ---(>1100 entries)---> [Pruning oldest]
                                       |                                |
                                       v                                v
                                [Flushed to disk] <--------------------+
```

## In-Memory State

| Variable         | Type              | Purpose                                    |
|------------------|-------------------|--------------------------------------------|
| diskLog          | LogEntry[] | null | Lazy-loaded from AsyncStorage              |
| currentMinute    | MinuteSummary | null | Active minute being accumulated         |
| pendingEvents    | EventEntry[]      | Events waiting for next disk flush         |
| lastNetworkState | boolean | null    | Dedup network transitions (log on change)  |

## Relationships

- **MinuteSummary** and **EventEntry** are both stored in the same **DiagnosticLog** array, ordered chronologically.
- The log is local to the device — no server-side persistence or synchronization.
- The log has no foreign key relationships to other entities (vans, routes, etc.).
