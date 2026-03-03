# Data Model: Fix Stop Progress Backfill

## Affected Entities

### route_run_stops (no schema changes)

| Column | Type | Notes |
|--------|------|-------|
| run_id | uuid (PK) | FK → route_runs(id) ON DELETE CASCADE |
| schedule_entry_id | uuid (PK) | FK → schedule_entries(id) ON DELETE CASCADE |
| status | text | CHECK: 'pending' or 'passed' |
| passed_at | timestamptz | Set when status → 'passed' |

**No migration required.** The existing schema already supports the backfill — `passed_at` is nullable and status transitions from `pending` → `passed`. The fix only changes *when* and *how many* rows transition per GPS ping.

### schedule_entries (read-only, no changes)

| Column | Type | Used by this feature |
|--------|------|---------------------|
| id | uuid (PK) | Joined via schedule_entry_id |
| time | text (HH:mm) | Chronological ordering for backfill |
| stop_lat | float | Geofence matching + coordinate grouping |
| stop_lng | float | Geofence matching + coordinate grouping |
| geofence_radius_m | integer | Distance threshold |

## State Transitions

```
           GPS ping + geofence match
pending ──────────────────────────────→ passed (with passed_at = now)

           GPS ping + backfill (time < matched stop)
pending ──────────────────────────────→ passed (with passed_at = now)
```

Both transitions set `passed_at` to the current timestamp. There is no distinction in the stored data between a geofence-matched stop and a backfilled stop.

## Index Coverage

Existing index `idx_route_run_stops_run_status ON (run_id, status)` covers:
- Step 5 query: `WHERE run_id = ? AND status = 'pending'`
- Backfill update: `WHERE run_id = ? AND schedule_entry_id IN (...)`

The backfill update uses the primary key `(run_id, schedule_entry_id)` via `.eq("run_id", ...).in("schedule_entry_id", [...])`, which is efficiently covered by the composite PK index. No new indexes needed.
