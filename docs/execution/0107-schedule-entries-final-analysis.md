# Schedule Entries Refactoring: `time` → `arrival_time` + `departure_time` + `stop_sequence`

## The Root Problem

`schedule_entries.time` is overloaded with three roles:

1. **Schedule meaning** — "when the van is at this stop"
2. **Sort order** — all 14+ `.sort()` calls and 4+ `.order("time")` queries derive chronology from clock values
3. **Fallback identity** — unique constraint `(route_id, time)`, and `page.tsx:81-84` matches stops by `stopName + time`

Simply renaming `time` to `arrival_time` shifts the coupling without fixing it. An explicit `stop_sequence` column is required to decouple ordering from clock values.

---

## New Columns

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `stop_sequence` | `integer` | NOT NULL | Explicit ordering, replaces time-based sorting |
| `arrival_time` | `time` | NOT NULL | When the van arrives; used for ETA, geofence matching, delay |
| `departure_time` | `time` | NOT NULL | When the van departs; used for schedule window, "still here vs left" |

### Semantics at boundaries

- **First stop (origin):** `arrival_time` = when van should be at the starting point, `departure_time` = when it departs.
- **Last stop (terminal):** `arrival_time` = scheduled arrival, `departure_time` = `arrival_time` (no dwell).
- **Pass-through stops:** `arrival_time == departure_time` is valid.

---

## Display Semantics

The API must expose separate `arrivalTime` and `departureTime` fields. Components choose which to display:

- **ETA context** (hero-card, peek, route-card): show `arrivalTime` — consistent with ETA target.
- **Schedule timeline**: show both as a range when they differ, single time when equal.
- **Admin editor**: two input fields.

This avoids ambiguity. Currently `hero-card.tsx:169` and `route-detail-peek.tsx:41` show scheduled time beside the ETA. Since ETA is arrival-based, the reference time must also be arrival-based.

---

## Semantic Mapping: Current `time` → New Fields

| Current usage | After refactor, use... | Rationale |
|---------------|----------------------|-----------|
| **Stop ordering** (14 `.sort()`, 4 `.order()`) | `stop_sequence` | Decouples order from clock; safe for edge cases |
| **Geofence early-arrival window** | `arrival_time` | "Is the van arriving too early?" |
| **ETA target** | `arrival_time` | "When will the van arrive at the next stop" |
| **Delay computation** | `arrival_time` | actual arrival vs scheduled arrival |
| **Schedule window** (`isWithinScheduleWindow`) | First stop `departure_time` → last stop `arrival_time` | Route active from first departure to last arrival |
| **Time-floor filtering** (skip past stops) | `departure_time` | Van already left this stop |
| **Cold-start detection** | First stop `departure_time` | "Van should have departed by now" |
| **Duplicate check / unique constraint** | `(route_id, stop_sequence)` | Replaces `(route_id, time)` |
| **Identity fallback** (`page.tsx:81-84`) | Match by `id` directly | Stop relying on name+time |
| **Display beside ETA** | `arrival_time` | Consistent with ETA semantics |

---

## Impact Inventory (directional, not exact)

> This inventory is a **scoping guide**, not an implementation checklist. Some listed files
> (especially tests) may need no changes after closer inspection. The real count will be
> determined during implementation.

### Database (1 new migration)

### Types & Validators (2 files)

- `src/types/index.ts` — `ScheduleEntry`, `NextStop`, `RouteDetail.schedule[]`, `TimelineStop`
- `src/lib/validators/schedule-entry.ts` — both create/update schemas

### Time Utilities (1 file)

- `src/lib/time.ts` — `isWithinScheduleWindow()`, `getNextStop()`

### Tracking Core (6 files — highest risk)

- `src/lib/tracking/eta.ts` — 4 sorts, time-floor, delay, schedule fallback (~30 refs)
- `src/lib/tracking/infer-stop-progress.ts` — `.order("time")`, JS sort, early-arrival, closest-in-time (~20 refs)
- `src/lib/tracking/process-device-geofence-events.ts` — same patterns (~15 refs)
- `src/lib/tracking/resolve-route-progress.ts` — time extraction, pointer validation (~10 refs)
- `src/lib/tracking/suggest-start-stop.ts` — cold-start time window (~8 refs)
- `src/lib/tracking/seed-route-run-stops.ts` — creates from schedule (~2 refs)

### API Routes (8 files)

- `src/app/api/routes/route.ts` — query, sort, map
- `src/app/api/routes/[routeId]/route.ts` — same
- `src/app/api/routes/[routeId]/start/route.ts` — first-stop time, seeds run stops
- `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` — sorts/filters by time
- `src/app/api/admin/routes/[routeId]/schedule/route.ts` — CRUD, duplicate check, **inserts `time` only**
- `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts` — **updates `time` only**
- `src/app/api/driver/routes/route.ts` — extracts/sorts times
- `src/app/api/tracker-config/[vanId]/route.ts` — `.order("time")`

### UI Components (5 files)

- `src/components/public/schedule-timeline.tsx` — display, past/future comparison
- `src/components/public/route-card.tsx` — `nextStop.time`
- `src/components/public/hero-card.tsx` — `nextStop.time` beside ETA
- `src/components/admin/schedule-editor.tsx` — 2 sorts, input fields, state
- `src/components/driver/route-card.tsx` — `stop.time`

> Note: `route-detail-peek.tsx` receives `scheduledTime` as a prop — the change is in its
> parent, not the component itself. `admin/routes/[routeId]/route.ts` has no time logic.

### Public Page (1 file)

- `src/app/(public)/routes/[routeId]/page.tsx` — identity match on `s.time`

### Scripts (4 files)

- `scripts/seed-schedule.ts` — needs sequence + two time fields
- `scripts/simulate-tracking.ts` — sorts by time for interpolation
- `scripts/precompute-stop-distances.ts` — `ORDER BY se.time`
- `scripts/reconcile-orphaned-shifts.ts` — finds max time

### Tests (~18 files, not all require changes)

| File | Time refs | Tests |
|------|-----------|-------|
| `tracking/eta.test.ts` | ~20 | ETA computation fixtures |
| `tracking/infer-stop-progress.test.ts` | ~25 | Geofence matching, backfill |
| `tracking/process-device-geofence-events.test.ts` | ~15 | Device geofence matching |
| `tracking/resolve-route-progress.test.ts` | ~25 | Pointer validation, ETA |
| `tracking/resolve-route-progress-idle.test.ts` | ~12 | Idle suppression |
| `tracking/resolve-route-progress-modes.test.ts` | ~12 | Mode-based ETA |
| `tracking/tracker-config.test.ts` | ~8 | Config versioning |
| `tracking/tracking-status.test.ts` | ~12 | GPS freshness (may not need changes) |
| `tracking/tracking-dedup.test.ts` | ~10 | Ping dedup (may not need changes) |
| `tracking/routes-api.test.ts` | ~15 | Route derivation |
| `tracking/time-factors.test.ts` | ~10 | Congestion factors |
| `tracking/resolve-next-stop.test.ts` | ~6 | Next stop resolution |
| `tracking/reconcile-orphaned-shifts.test.ts` | ~12 | Orphan detection |
| `lib/tracking/confirm-start-stop.test.ts` | ~10 | Cold-start confirmation |
| `lib/tracking/suggest-start-stop.test.ts` | ~15 | Start suggestion |
| `components/schedule-timeline.test.ts` | ~12 | Timeline classification |
| `components/route-detail-eta.test.ts` | ~6 | ETA display |
| `components/route-card-eta.test.ts` | ~6 | ETA badge |

---

## Migration Plan (4 phases)

### Phase 1 — Add columns + bidirectional dual-write trigger

```sql
-- Add new columns (nullable initially)
ALTER TABLE schedule_entries
  ADD COLUMN stop_sequence  integer,
  ADD COLUMN arrival_time   time,
  ADD COLUMN departure_time time;

-- Backfill from existing data (both times = legacy time, no behavior change)
UPDATE schedule_entries SET
  arrival_time   = time,
  departure_time = time,
  stop_sequence  = sub.seq
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY route_id ORDER BY time
  ) AS seq
  FROM schedule_entries
) sub WHERE schedule_entries.id = sub.id;

-- Make NOT NULL after backfill
ALTER TABLE schedule_entries
  ALTER COLUMN stop_sequence  SET NOT NULL,
  ALTER COLUMN arrival_time   SET NOT NULL,
  ALTER COLUMN departure_time SET NOT NULL;

-- Hard invariant: departure can never be before arrival
ALTER TABLE schedule_entries
  ADD CONSTRAINT chk_departure_gte_arrival
  CHECK (departure_time >= arrival_time);

-- BIDIRECTIONAL dual-write trigger:
-- Legacy writers (still using `time`) populate new columns.
-- New writers (using arrival_time) populate legacy column.
CREATE OR REPLACE FUNCTION sync_schedule_time_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Legacy insert: only `time` provided → fill new fields
    IF NEW.arrival_time IS NULL AND NEW.time IS NOT NULL THEN
      NEW.arrival_time   := NEW.time;
      NEW.departure_time := NEW.time;
    END IF;
    -- New insert: arrival_time provided → fill legacy
    IF NEW.time IS NULL AND NEW.arrival_time IS NOT NULL THEN
      NEW.time := NEW.arrival_time;
    END IF;
    -- Auto-assign stop_sequence if not provided
    IF NEW.stop_sequence IS NULL THEN
      SELECT COALESCE(MAX(stop_sequence), 0) + 1
        INTO NEW.stop_sequence
        FROM schedule_entries
       WHERE route_id = NEW.route_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Legacy update: time changed → sync to new fields
    IF NEW.time IS DISTINCT FROM OLD.time
       AND NEW.arrival_time IS NOT DISTINCT FROM OLD.arrival_time THEN
      NEW.arrival_time   := NEW.time;
      NEW.departure_time := NEW.time;
    END IF;
    -- New update: arrival_time changed → sync to legacy
    IF NEW.arrival_time IS DISTINCT FROM OLD.arrival_time
       AND NEW.time IS NOT DISTINCT FROM OLD.time THEN
      NEW.time := NEW.arrival_time;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_schedule_times
  BEFORE INSERT OR UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION sync_schedule_time_fields();
```

This ensures legacy writers (admin schedule POST/PUT, seed script) continue writing only `time` and the trigger fills `arrival_time`, `departure_time`, and `stop_sequence` automatically. No insert fails, no inconsistency. The `CHECK` constraint guarantees `departure_time >= arrival_time` at the database level regardless of write path.

### Phase 2 — Reorder endpoint + migrate ordering to `stop_sequence`

**The reorder endpoint is required before switching to sequence-based ordering.** Without it, a stop added at "07:30" between existing stops at "07:00" (seq 1) and "08:00" (seq 2) would land at seq 3 (end of route) via the trigger's `MAX+1` logic, instead of between them.

Steps:

1. **Add `PATCH /api/admin/routes/:routeId/schedule/reorder`** — accepts an ordered array of entry IDs, bulk-updates `stop_sequence` values (1, 2, 3...).
2. **Update admin `schedule-editor.tsx`** to call the reorder endpoint after add/edit operations, or provide drag-and-drop reordering.
3. Replace all 14 `.sort((a,b) => a.time.localeCompare(b.time))` with `a.stopSequence - b.stopSequence`.
4. Replace all `.order("time", ...)` Supabase calls with `.order("stop_sequence", ...)`.
5. Replace SQL `ORDER BY se.time` with `ORDER BY se.stop_sequence`.
6. Update unique constraint: `(route_id, time)` → `(route_id, stop_sequence)`.
7. Update index: `idx_schedule_entries_route_time` → `idx_schedule_entries_route_sequence`.

**Sequence maintenance rules:**

- **Insert:** trigger auto-assigns `MAX(stop_sequence) + 1` (appends to end). Admin then reorders via the reorder endpoint.
- **Delete:** gaps in sequence are harmless — ordering is relative, not positional. No resequencing needed.
- **Edit:** sequence unchanged unless explicitly reordered.

### Phase 3 — Adopt arrival/departure semantics + migrate all writers

> **Why writers must be migrated in this phase (not later):** The dual-write trigger resets
> `arrival_time` and `departure_time` back to the same value whenever a legacy writer updates
> only `time`. If the tracking core and API responses start consuming divergent arrival/departure
> values while the admin editor still writes only `time`, any admin edit would silently collapse
> the two times back to equal. Writers and consumers must switch together.

Steps:

1. **Update Zod validators** (`schedule-entry.ts`): replace `time` with `arrivalTime` + `departureTime`, add `.refine(d => d.departureTime >= d.arrivalTime, ...)` validation.
2. **Update admin API routes** (`schedule/route.ts`, `schedule/[entryId]/route.ts`): write `arrival_time`, `departure_time` instead of `time`.
3. **Update admin `schedule-editor.tsx`**: two time inputs per stop.
4. **Update seed script** (`seed-schedule.ts`): include both times.
5. **Update TypeScript types** (`types/index.ts`): `time` → `arrivalTime` + `departureTime` + `stopSequence` across `ScheduleEntry`, `NextStop`, `RouteDetail.schedule[]`, `TimelineStop`.
6. **Update tracking core** with the semantic mapping table above.
7. **Update API responses** to return `arrivalTime`, `departureTime`, `stopSequence`.
8. **Update public components**: `arrivalTime` beside ETA.
9. **Update test files**.

After this phase, the dual-write trigger serves only as a safety net. All active writers use the new fields.

### Phase 4 — Drop legacy `time`

- Remove `time` column.
- Remove dual-write trigger function and trigger.
- Remove old index.
- Final cleanup of any remaining references.

---

## Known Limitations

### Concurrency on `stop_sequence`

The `MAX(stop_sequence) + 1` pattern in the trigger is **not serialized by Postgres**. Two concurrent inserts for the same route can compute the same next value, and the unique constraint `(route_id, stop_sequence)` will turn the race into a failed insert (409 error).

**This is an accepted limitation** because:

- Schedule writes are admin-only operations.
- There is typically one admin user editing schedules.
- Write frequency is very low (a few times per day at most).

If this ever becomes a problem, the fix is `SELECT ... FOR UPDATE` or `pg_advisory_xact_lock(route_id)` in the trigger.

---

## Risk Matrix

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Backfill on production data | 1 | Run in transaction, verify row count matches |
| Legacy writers fail on NOT NULL | 1 | Bidirectional trigger fills missing columns |
| `departure_time < arrival_time` from bad input | 1 | DB `CHECK` constraint + Zod `.refine()` in Phase 3 validators |
| Reorder endpoint missing when sequence ships | 2 | Reorder is a **required** deliverable in Phase 2, not optional |
| Sequence gaps after deletes | 2 | Gaps are harmless; ordering is relative |
| Sequence collisions on concurrent inserts | 2 | Accepted limitation (admin-only, low-freq); unique constraint prevents silent corruption |
| Legacy writer resets divergent arrival/departure | 3 | Writers and consumers migrate together in same phase; no window of inconsistency |
| Tracking logic uses wrong time field | 3 | Semantic mapping table as guide; full test suite after each file |
| Display inconsistency (ETA vs reference time) | 3 | Both use `arrival_time` — consistent by design |
