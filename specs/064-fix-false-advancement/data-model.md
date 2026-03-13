# Data Model: Prevent False Stop Advancement

**Feature**: 064-fix-false-advancement
**Date**: 2026-03-11

## Entities (No Schema Changes)

This feature modifies behavior only — no tables, columns, or constraints are added or changed.

### tracking_geofence_events (existing)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| van_id | uuid FK→vans | |
| event_id | text | Device-assigned, UNIQUE(van_id, event_id) |
| place_id | text | Geofence place identifier |
| entered_at | timestamptz | Device-reported entry time |
| received_at | timestamptz | Server receive time (default now()) |
| matched_run_id | uuid FK→route_runs | Set when status='matched' |
| matched_schedule_entry_id | uuid FK→schedule_entries | Set when status='matched' |
| status | text | 'received' / 'matched' / 'no_match' |

**Behavioral change**: `status='received'` now covers two cases:
1. Newly inserted event awaiting first processing (existing)
2. Deferred non-adjacent event awaiting retry (new)

Both cases are re-processed identically on subsequent pings. The distinction is observable only via structured logs (new).

### route_run_stops (existing)

| Column | Type | Notes |
|--------|------|-------|
| run_id | uuid FK→route_runs | Composite PK |
| schedule_entry_id | uuid FK→schedule_entries | Composite PK |
| status | text | 'pending' / 'passed' |
| passed_at | timestamptz | When stop was confirmed |
| pass_source | text | 'device_geofence' / 'geofence_raw' / 'geofence_snapped' / 'backfill' / 'manual' |
| pass_confidence | numeric | 0.0–1.0 |

**Behavioral change**: `pass_source='backfill'` will no longer be written by the device geofence processor. Existing backfill rows from before the fix may remain in historical data.

### schedule_entries (existing, config change only)

| Column | Type | Notes |
|--------|------|-------|
| device_geofence_radius_m | integer (nullable) | Per-stop override; NULL falls back to 150m |

**Operational change**: Dense downtown stops (CAAB, Forum Ruy Barbosa, etc.) will have explicit values set via SQL. No code change.

## State Transitions

### Geofence Event Lifecycle (updated)

```
[device submits event]
        │
        ▼
    received ──────────────────┐
        │                      │
   ┌────┴────┐            (re-submitted,
   │ match?  │             still not
   │         │             head-of-line)
   ▼         ▼                 │
matched   no_match             │
   │                           │
   │    ┌──────────────────────┘
   │    │  (matchedIndex > 0:
   │    │   deferred, stays received)
   │    ▼
   │  received ◄── retry on next ping
   │    │
   │    ├── (matchedIndex === 0) ──► matched
   │    └── (still not head) ──────► received (loop)
   │
   ▼
 [stop marked passed, event acked]
```

### Route Run Stop Lifecycle (unchanged)

```
pending ──► passed
```

Only transition. No new states. The change is *when* the transition occurs (only when contiguous), not *what* the transition is.
