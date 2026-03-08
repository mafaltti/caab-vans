# Data Model: Gate Stop-Progress Inference by Active Shift

## No Schema Changes Required

This feature adds application logic only. All tables already exist.

## Existing Entities (Reference)

### route_runs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| route_id | uuid FK → routes | |
| service_date | date | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| **UNIQUE** | (route_id, service_date) | |

### route_shifts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → route_runs | ON DELETE CASCADE |
| driver_id | uuid | |
| started_at | timestamptz NOT NULL | |
| ended_at | timestamptz | **NULL = active shift** |
| created_at | timestamptz | |

**Index**: `idx_route_shifts_run(run_id, started_at)`

### route_run_stops
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → route_runs | |
| schedule_entry_id | uuid FK → schedule_entries | |
| status | text | "pending" or "passed" |
| passed_at | timestamptz | Set when marked passed |

## Query Added

```
SELECT id, ended_at
FROM route_shifts
WHERE run_id = :run_id AND ended_at IS NULL
LIMIT 1
```

Uses existing index `idx_route_shifts_run`. Expected 0–3 rows per run.

## State Flow (Updated)

```
GPS Ping arrives
  → update_van_position (RPC)
    → if position updated:
        inferStopProgress(vanId, lat, lng)
          1. Upsert route_run          ← unchanged
          2. Check active shift         ← NEW GATE
             └─ No active shift? → return EMPTY_PROGRESS (skip steps 3-7)
          3. Seed route_run_stops       ← only if active shift
          4. Geofence check             ← only if active shift
          5. Mark passed                ← only if active shift
          6. Backfill                   ← only if active shift
          7. Build result               ← only if active shift
```
