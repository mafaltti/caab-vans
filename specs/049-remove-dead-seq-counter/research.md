# Research: Remove Dead Sequence Counter

**Date**: 2026-03-07
**Feature**: 049-remove-dead-seq-counter

## Decision 1: Remove all application-layer `seq` code

**Decision**: Delete all `seq`-related code from both the tracker app and the server, except the Zod validator field and the database column/index.

**Rationale**:
- `resetSequence()` is exported but has zero callers (confirmed via exhaustive search).
- `currentSeq` increments forever with no reset, spanning multiple route runs — making per-run gap detection meaningless.
- Server gap detection only emits `console.warn` — no alerts, no retry, no business logic.
- `device_ts` ordering in the immutable ping log provides superior ordering guarantees.
- Spec FR-016/FR-017 explicitly state "no automatic recovery is attempted."

**Alternatives considered**:
- *Fix the reset mechanism*: Rejected — no consumer needs gap detection, and `device_ts` is sufficient.
- *Keep seq as observational metric*: Rejected — `console.warn` with no aggregation adds no value.

## Decision 2: Drop database column and index

**Decision**: Create migration `00010_drop_seq_column.sql` to drop the `seq` column and `idx_van_location_pings_van_seq` partial index.

**Rationale**:
- The column serves no purpose — no application code reads or writes it.
- Keeping dead columns adds confusion for future developers.
- The partial index only covers non-null seq rows; no new rows will have seq, so the index is wasted space.
- Old pings' seq values have no business value (gap detection was never actionable).

**Alternatives considered**:
- *Retain column*: Initially planned but rejected — unnecessary clutter with zero benefit.

## Decision 3: Remove `seq` from Zod validator

**Decision**: Remove `seq` from the tracking Zod schema entirely.

**Rationale**:
- The tracker update and server deploy ship together — no rollout window with mixed client versions.
- Zod v4 strips unknown keys by default (no `strict()` mode), so old clients sending `seq` will not get 400 errors — the field is silently ignored.
- Keeping dead fields in the validator adds confusion.

**Alternatives considered**:
- *Keep as optional for backward compat*: Initially planned but rejected — Zod's default stripping behavior provides the same safety without keeping dead schema fields.

## File Inventory (verified line numbers)

### Tracker App

| File | Line(s) | What | Action |
|------|---------|------|--------|
| `apps/van-tracker/src/location/task.ts` | 47 | `let currentSeq = 0;` | DELETE |
| `apps/van-tracker/src/location/task.ts` | 220, 239-241 | AsyncStorage hydration | DELETE |
| `apps/van-tracker/src/location/task.ts` | 337 | `point.seq = currentSeq;` | DELETE |
| `apps/van-tracker/src/location/task.ts` | 353-354 | `currentSeq++; AsyncStorage.setItem(...)` | DELETE |
| `apps/van-tracker/src/location/task.ts` | 410-414 | `resetSequence()` function | DELETE |
| `apps/van-tracker/src/types.ts` | 8 | `seq?: number \| null;` | DELETE |
| `apps/van-tracker/src/api/client.ts` | 49 | `seq: point.seq,` (single ping) | DELETE |
| `apps/van-tracker/src/api/client.ts` | 127 | `seq: p.seq,` (batch ping) | DELETE |

### Server

| File | Line(s) | What | Action |
|------|---------|------|--------|
| `src/app/api/tracking/[vanId]/route.ts` | 72 | `seq,` destructuring | DELETE |
| `src/app/api/tracking/[vanId]/route.ts` | 103 | `seq: seq ?? null,` in upsert | DELETE |
| `src/app/api/tracking/[vanId]/route.ts` | 127-145 | Gap detection block | DELETE |
| `src/app/api/tracking-batch/[vanId]/route.ts` | 98 | `seq: point.seq ?? null,` in upsert | DELETE |
| `src/app/api/tracking-batch/[vanId]/route.ts` | — | Gap detection block | NOT PRESENT (verified) |
| `src/lib/validators/tracking.ts` | 11 | `seq` in Zod schema | DELETE |

### Database

| File | Line(s) | What | Action |
|------|---------|------|--------|
| `supabase/migrations/00007_tracker_resilience.sql` | 5 | `ADD COLUMN seq integer,` | Superseded by migration `00010` |
| `supabase/migrations/00007_tracker_resilience.sql` | 12-14 | Partial index on `(van_id, seq)` | Superseded by migration `00010` |
| `supabase/migrations/00010_drop_seq_column.sql` | — | Drop column + index | NEW |
