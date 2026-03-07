# Quickstart: Remove Dead Sequence Counter

**Branch**: `049-remove-dead-seq-counter`

## Overview

Remove the dead `seq` (sequence counter) mechanism from the tracker app, server, Zod validator, and database. Pure code deletion + one migration to drop the column and index.

## Steps

### 1. Tracker App Changes

**`apps/van-tracker/src/location/task.ts`** — Remove 6 code blocks:
- `let currentSeq = 0;` declaration
- AsyncStorage hydration of `@currentSeq`
- `point.seq = currentSeq;` assignment
- `currentSeq++` increment + AsyncStorage persist
- `resetSequence()` function export

**`apps/van-tracker/src/types.ts`** — Remove:
- `seq?: number | null;` from `LocationPoint`

**`apps/van-tracker/src/api/client.ts`** — Remove:
- `seq: point.seq,` from single-ping body
- `seq: p.seq,` from batch-ping body

### 2. Server Changes

**`src/app/api/tracking/[vanId]/route.ts`** — Remove:
- `seq,` from destructuring
- `seq: seq ?? null,` from upsert object
- Entire gap detection block (~18 lines)

**`src/app/api/tracking-batch/[vanId]/route.ts`** — Remove:
- `seq: point.seq ?? null,` from upsert object

### 3. Validator cleanup

**`src/lib/validators/tracking.ts`** — Remove `seq` field from Zod schema. Zod v4 strips unknown keys by default, so old clients sending `seq` won't get validation errors.

### 4. Database migration

**`supabase/migrations/00010_drop_seq_column.sql`** — Drop the `seq` column and `idx_van_location_pings_van_seq` partial index.

### 5. Verify

```bash
# Server
cd C:/Projetos/caab-vans
npx eslint .
npx tsc --noEmit
npx next build
npx vitest run

# Tracker app
cd apps/van-tracker
npx eslint .
npx tsc --noEmit
npx expo export
```

## What NOT to do

- Do NOT modify existing migration files (e.g., `00007_tracker_resilience.sql`).
