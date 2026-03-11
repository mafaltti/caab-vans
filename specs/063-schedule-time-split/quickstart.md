# Quickstart: Schedule Time Split

**Feature**: 063-schedule-time-split
**Branch**: `063-schedule-time-split`

## Prerequisites

- Node.js (see `.nvmrc`)
- Supabase local stack running (`docker compose up` in `infra/supabase/`)
- `npm install` completed

## Development Setup

```bash
# Switch to feature branch
git checkout 063-schedule-time-split

# Install dependencies (if needed)
npm install

# Run migrations against local Supabase
# After creating the new migration file:
psql -h localhost -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00016_schedule_time_split.sql

# Start dev server
npm run dev
```

## Key Files to Modify (by phase)

### Phase 1 — Migration
- `supabase/migrations/00016_schedule_time_split.sql` (new)

### Phase 2 — Reorder + sequence ordering
- `src/app/api/admin/routes/[routeId]/schedule/reorder/route.ts` (new)
- `src/lib/validators/schedule-entry.ts` (add reorder schema)
- All files with `.sort()` on `time` or `.order("time")` (see research.md R4)

### Phase 3 — Adopt arrival/departure
- `src/types/index.ts`
- `src/lib/validators/schedule-entry.ts`
- `src/lib/time.ts`
- `src/lib/tracking/eta.ts`
- `src/lib/tracking/infer-stop-progress.ts`
- `src/lib/tracking/process-device-geofence-events.ts`
- `src/lib/tracking/resolve-route-progress.ts`
- `src/lib/tracking/suggest-start-stop.ts`
- `src/lib/tracking/seed-route-run-stops.ts`
- All API route files (see research.md R5)
- All UI components (see research.md R6)
- All scripts (see research.md R7)
- Test files (update fixtures)

### Phase 4 — Drop legacy
- `supabase/migrations/00017_drop_legacy_time.sql` (new)
- Remove any remaining `time` references

## Running Tests

```bash
# Run all tests
npm test

# Run tracking tests specifically (highest risk area)
npx vitest run src/lib/tracking/

# Run component tests
npx vitest run src/components/

# Type check
npx tsc --noEmit

# Lint
npx eslint .

# Build
npm run build
```

## Verification Checklist

After each phase:
1. `npx tsc --noEmit` passes
2. `npx vitest run` passes
3. `npm run build` succeeds
4. Manual check: admin schedule editor shows correct fields
5. Manual check: public route page shows correct times beside ETA
