# Quickstart: Tracking System Hardening

## Prerequisites

- Node.js 20+
- Running Supabase instance (local or dev)
- OSRM instance (optional, for snapped coordinate tests)

## Setup

```bash
npm install
```

## Run Tests

```bash
npx vitest run src/__tests__/tracking/
```

## Key Files to Modify

### Phase 1: Event-Time Replay (Foundational)
- `src/lib/tracking/infer-stop-progress.ts` — signature change, event-time derivation
- `src/app/api/tracking-batch/[vanId]/route.ts` — per-ping replay
- `src/app/api/tracking/[vanId]/route.ts` — pass eventTs
- `src/lib/tracking/osrm.ts` — add matchTrajectory()
- `supabase/migrations/00014_add_snapped_coords_to_van_location_pings.sql`

### Phase 2: Canonical Writes
- `src/lib/tracking/infer-stop-progress.ts` — contiguous prefix enforcement on write

### Phase 3: Shared Position Selection
- `src/lib/tracking/effective-position.ts` — new shared helper
- `src/lib/tracking/eta.ts` — VanPosition extension, use shared helper
- `src/lib/tracking/infer-stop-progress.ts` — use shared helper

### Phase 4: Confidence Evidence
- `src/lib/tracking/infer-stop-progress.ts` — remove .limit(50), source-aligned scoring

### Phase 5: Orphan Health
- `src/lib/tracking/orphaned-shift-health.ts` — new shared helper
- `src/lib/tracking/resolve-route-progress.ts` — add runHealth field
- `scripts/reconcile-orphaned-shifts.ts` — use shared helper
- `src/types/index.ts` — add runHealth to RouteProgress

## Migration

```bash
# Apply the new migration
npx supabase db push
```

## Verification

```bash
# Type check
npx tsc --noEmit

# Lint
npx eslint .

# Tests
npx vitest run

# Build
npx next build
```
