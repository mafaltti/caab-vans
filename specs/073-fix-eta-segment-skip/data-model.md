# Data Model: Fix ETA Segment Distance After Stop Skip

## Entities (no schema changes)

No database schema changes required. This fix operates entirely on in-memory data structures.

## Type Changes

### Stop interface (`eta.ts`)

| Field | Current Type | New Type | Reason |
|-------|-------------|----------|--------|
| status | `"pending" \| "passed"` | `"pending" \| "passed" \| "skipped"` | Allow skipped stops to flow through to segment accumulation |

### No other type changes

- `EtaResult` — unchanged
- `VanPosition` — unchanged
- `RecentRun` — unchanged
- Database schema (`schedule_entries`, `route_run_stops`) — unchanged

## Data Flow Change

### Before (broken)

```
route_run_stops (DB)
  → filter(status !== "skipped")     ← skipped removed here
  → map to Stop[]
  → computeEta(stops)
    → segment loop: [#13, #15]       ← gap, #13.osrmDistanceM → #14 (wrong)
```

### After (fixed)

```
route_run_stops (DB)
  → map to Stop[] (all statuses)     ← skipped included
  → computeEta(stops)
    → passed/pending filters: exclude skipped (correct)
    → segment loop: [#13, #14, #15]  ← no gap, distances sum correctly
```
