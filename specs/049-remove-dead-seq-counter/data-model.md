# Data Model: Remove Dead Sequence Counter

**Date**: 2026-03-07
**Feature**: 049-remove-dead-seq-counter

## Schema Changes

Migration `00010_drop_seq_column.sql` drops the `seq` column and its partial index from `van_location_pings`.

### Dropped

| Table | Column/Index | Type | Migration |
|-------|-------------|------|-----------|
| `van_location_pings` | `seq` | `integer` (nullable) | `DROP COLUMN IF EXISTS seq` |
| `van_location_pings` | `idx_van_location_pings_van_seq` | Partial index `(van_id, seq) WHERE seq IS NOT NULL` | `DROP INDEX IF EXISTS` |

## Application-Layer Type Changes

### `LocationPoint` (tracker app)

**Before**: `seq?: number | null`

**After**: Field removed entirely.

### Server request handling

**Before**: `seq` destructured from validated request body and written to `van_location_pings.seq`.

**After**: `seq` removed from Zod schema. If present in request body from old clients, Zod v4 strips the unknown key silently. The database column is dropped via migration.
