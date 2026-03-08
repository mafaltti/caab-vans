# Data Model: Tracking Progress Hardening

No new entities, tables, or columns are introduced. This feature modifies the behavior of existing entities.

## Modified Entity Behaviors

### Progress Pointer (on `route_runs` table)

**Existing fields** (unchanged):
- `last_passed_stop_id` — FK to `schedule_entries.id`
- `next_stop_id` — FK to `schedule_entries.id`
- `progress_updated_at` — timestamp of last pointer update

**New invariant** (enforced in application code, not DB constraint):
- **Adjacency rule**: `next_stop_id` MUST be the immediate chronological successor of `last_passed_stop_id` in the route's schedule. No pending `route_run_stops` may exist between them.
- If the invariant cannot be satisfied (e.g., non-contiguous passed stops due to low-confidence match), `last_passed_stop_id` is rolled back to the last contiguously-passed stop.

### Pass Confidence (on `route_run_stops` table)

**Existing fields** (unchanged):
- `pass_confidence` — numeric (0.0–1.0)
- `pass_source` — text ("geofence_raw" | "geofence_snapped" | "backfill")

**Behavioral change**:
- Confidence scoring now uses a deterministic ping sample (ordered by `device_ts DESC, id DESC`, limited to 50 rows).
- No change to the confidence threshold (>0.7 for backfill).

### ETA Status (computed, not persisted)

**Existing values** (unchanged): `"estimated"` | `"overdue"` | `"none"`

**Behavioral change**:
- The `"overdue"` status is now rendered in the UI (previously hidden silently).

## State Transition Changes

### Pointer Validation (read path)

```
persisted pointer → [exists?] → [pending?] → [fresh?] → [adjacent?] → accepted
                                                              ↓ no
                                                        rejected → schedule fallback
```

The `[adjacent?]` check is new. It verifies that no pending stops exist between `last_passed_stop_id` and `next_stop_id`.
