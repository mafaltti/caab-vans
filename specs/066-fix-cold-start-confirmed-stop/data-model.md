# Data Model: Fix Cold-Start Confirmed Stop

## No Schema Changes

This fix modifies **behavior only** — no new tables, columns, or migrations.

## Affected Entities

### route_run_stops

**Existing columns used** (no changes):

| Column | Type | Behavior Change |
|--------|------|----------------|
| status | text ('pending' / 'passed') | Confirmed stop now transitions to 'passed' during cold-start confirmation (was left as 'pending') |
| pass_source | text | Confirmed stop gets 'manual' (same as prior stops) |
| pass_confidence | numeric | Confirmed stop gets 0.85 (same as prior stops) |
| passed_at | timestamptz | Confirmed stop gets current timestamp (same as prior stops) |

### route_runs

**Existing columns used** (no changes):

| Column | Type | Behavior Change |
|--------|------|----------------|
| next_stop_id | uuid | After confirmation, points to stop **after** confirmed stop (was pointing to confirmed stop itself) |
| last_passed_stop_id | uuid | After confirmation, points to confirmed stop (was pointing to last prior stop) |
| progress_updated_at | timestamptz | Updated as before via `persistCanonicalProgress` |

## State Transition (Before vs After Fix)

### Before (broken)

```
Confirm stop #7 →
  stops 1-6: passed (manual)
  stop  #7:  pending ← STUCK (no geofence enter event fires)
  stops 8+:  pending ← BLOCKED (head-of-line guard)
  next_stop_id = stop #7
  last_passed_stop_id = stop #6
```

### After (fixed)

```
Confirm stop #7 →
  stops 1-7: passed (manual)
  stops 8+:  pending ← UNBLOCKED (head-of-line is now stop #8)
  next_stop_id = stop #8
  last_passed_stop_id = stop #7
```
