# Data Model: GPS Corroboration Gate

**Feature**: 077-geofence-corroboration
**Date**: 2026-03-18

## Schema Changes

### Modified: `tracking_geofence_events.status` CHECK constraint

**Current**:
```sql
CHECK (status IN ('received', 'matched', 'no_match', 'deferred'))
```

**New**:
```sql
CHECK (status IN ('received', 'matched', 'no_match', 'deferred', 'awaiting_corroboration'))
```

### Modified: `tracking_geofence_events` — populate `matched_schedule_entry_id` earlier

Currently `matched_schedule_entry_id` is only set when status transitions to `"matched"`. With corroboration, it will also be set when status transitions to `"awaiting_corroboration"` — the stop has been identified, it just hasn't been confirmed yet. This allows the corroboration evaluation to know which stop's coordinates to check against.

Similarly, `matched_run_id` is set at the awaiting phase.

No column additions needed — existing columns are reused.

## Entity Lifecycle: Geofence Event

```
                 ┌──────────┐
                 │ received │  (event arrives from device)
                 └────┬─────┘
                      │
              match stop by placeId + time
                      │
            ┌─────────┼─────────────┐
            │         │             │
       no match   head-of-line   not head-of-line
            │         │             │
            ▼         ▼             ▼
      ┌──────────┐  ┌───────────────────────┐  ┌──────────┐
      │ no_match │  │ awaiting_corroboration │  │ deferred │
      └──────────┘  └───────────┬───────────┘  └────┬─────┘
                                │                    │
                   ┌────────────┼───────────┐   (earlier stop
                   │            │           │    passes)
              GPS ≤50m    GPS stale    no GPS     │
                   │       (30s)      stream      │
                   │            │           │     ▼
                   ▼            ▼           ▼   re-evaluate
              ┌─────────────────────────────┐   (→ awaiting_corroboration
              │           matched           │    or no_match)
              │  (stop marked as passed)    │
              │                             │
              │  confidence:                │
              │   0.95 — GPS corroborated   │
              │   0.90 — staleness fallback │
              │   0.85 — no GPS stream      │
              └─────────────────────────────┘
```

## Entity Lifecycle: Route Run Stop (unchanged)

The `route_run_stops` table is NOT modified. Stops remain `"pending"` while their geofence event is in `"awaiting_corroboration"`. They only transition to `"passed"` when the event reaches `"matched"`.

```
pending → passed (when geofence event reaches "matched")
pending → skipped (manual or backfill)
```

## Key Relationships

```
tracking_geofence_events
  ├── van_id → vans.id
  ├── matched_run_id → route_runs.id (set at awaiting_corroboration phase)
  └── matched_schedule_entry_id → schedule_entries.id (set at awaiting_corroboration phase)
        └── schedule_entries.geofence_radius_m (used for distance check)
        └── schedule_entries.stop_lat, stop_lng (used for distance check)

van_location_pings
  ├── van_id → vans.id
  ├── received_at (server timestamp — used for staleness evaluation)
  └── lat, lng (used for haversine distance in corroboration check)
```

## Staleness Evaluation Logic

```
Given: event with status = "awaiting_corroboration"
       event.received_at = server timestamp when event was received

1. Query latest van_location_pings.received_at for this van
   WHERE received_at > event.received_at

2. If any pings exist after event receipt:
   → GPS stream is alive; do NOT fall back
   → Check haversine distance from latest ping to matched stop
   → If distance ≤ geofence_radius_m: confirm (0.95)
   → Else: keep waiting

3. If NO pings exist after event receipt AND (now - event.received_at) >= 30s:
   → GPS stream is stale; fall back
   → Confirm with staleness confidence (0.90)

4. If NO pings exist EVER for this van in this run:
   → No GPS stream; immediate fallback
   → Confirm with no-GPS confidence (0.85)
```

## Index Considerations

The existing index `idx_tge_van_status ON tracking_geofence_events (van_id, status)` already supports querying events by van and status. The new `"awaiting_corroboration"` status will use this index efficiently.

No new indexes needed.
