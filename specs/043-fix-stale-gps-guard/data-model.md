# Data Model: Fix Stale GPS Guard

**Date**: 2026-03-06
**Feature**: 043-fix-stale-gps-guard

## Entity Changes

### MinuteSummary (extended)

Existing interface in `apps/van-tracker/src/storage/diag-log.ts`.

**New fields** (added alongside existing `flt`):

| Field      | Type   | Default | Description                          |
|------------|--------|---------|--------------------------------------|
| flt_acc    | number | 0       | Filtered: accuracy > 50m             |
| flt_dup    | number | 0       | Filtered: duplicate GPS timestamp    |
| flt_stale  | number | 0       | Filtered: stale fix (age > threshold)|

**Invariant**: `flt === flt_acc + flt_dup + flt_stale` for every summary row.

### FilterReason (new type)

```
type FilterReason = "acc" | "dup" | "stale"
```

Used as parameter to `logFiltered(reason)`.

## No Database Changes

This feature modifies only in-memory data structures within the tracker app. No Supabase/Postgres schema changes. No API contract changes. The `van_location_pings` table is unaffected — pings that pass the relaxed filter are sent via the existing API exactly as before.

## State Transitions

No new state machines. The existing tracking task flow is unchanged; only the filter decision logic within the GPS callback is modified.
