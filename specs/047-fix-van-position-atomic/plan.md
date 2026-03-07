# Implementation Plan: Atomic Van Position Update

**Branch**: `047-fix-van-position-atomic` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/047-fix-van-position-atomic/spec.md`

## Summary

Replace the current read-decide-update pattern in GPS ping ingest with a single atomic database RPC function (`update_van_position`) that:
1. Adds a `last_gps_fix_at` column storing the actual GPS device timestamp.
2. Uses a `WHERE` guard (`p_device_ts > last_gps_fix_at`) to prevent position regression.
3. Returns a boolean indicating whether the update occurred (for conditional downstream processing).

All consumers of `location_updated_at` for freshness/ETA are migrated to read `last_gps_fix_at`. The `location_updated_at` column is preserved for admin/audit purposes.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Next.js, Supabase JS client, Luxon, Zod
**Storage**: PostgreSQL (Supabase self-hosted) — `vans` and `van_location_pings` tables
**Testing**: Vitest
**Target Platform**: Linux VPS (Docker)
**Project Type**: Web service (BFF API routes)
**Performance Goals**: Ingest latency must not increase; RPC call replaces 2 separate DB calls (net improvement)
**Constraints**: No Supabase Edge Functions; all logic in Next.js Route Handlers or PostgreSQL RPC
**Scale/Scope**: ~10-50 vans, pings every 5-10s per van

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | RPC replaces read-decide-update with single atomic call; removes `previousLatest` query; net code reduction |
| II. Explicit Trade-offs | PASS | PR will document: new column + RPC vs. column rename, atomic vs. optimistic locking |
| III. Branch & Merge | PASS | Feature branch targets `dev` |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be verified |
| V. Stack Constraints | PASS | PostgreSQL RPC (not Edge Function); Next.js Route Handlers; Luxon for time |
| Security | PASS | RPC called via service role key (server-only); no new public surface |
| Timezone | PASS | `device_ts` already clamped to Bahia time in existing validation |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/047-fix-van-position-atomic/
├── plan.md              # This file
├── research.md          # Phase 0: design decisions
├── data-model.md        # Phase 1: schema changes
├── quickstart.md        # Phase 1: developer guide
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (files touched)

```text
supabase/migrations/
└── 00009_atomic_van_position.sql     # New migration: column + RPC + backfill

src/app/api/
├── tracking/[vanId]/route.ts         # Replace vans UPDATE with RPC call
├── tracking-batch/[vanId]/route.ts   # Replace vans UPDATE with RPC call
├── admin/vans/route.ts               # Add last_gps_fix_at to select + response
└── routes/
    ├── route.ts                      # Read last_gps_fix_at instead of location_updated_at
    └── [routeId]/route.ts            # Read last_gps_fix_at instead of location_updated_at

src/app/(public)/routes/[routeId]/page.tsx  # Rename prop to lastGpsFixAt
src/app/admin/vans/page.tsx                 # Add lastGpsFixAt to VanItem type

src/components/public/hero-card.tsx         # Rename prop to lastGpsFixAt

src/lib/
├── time.ts                           # isLocationFresh: reject future timestamps (elapsed >= 0)
└── tracking/
    ├── eta.ts                        # VanPosition interface: locationUpdatedAt → lastGpsFixAt
    └── tracker-health.ts             # Query last_gps_fix_at for staleness

src/types/index.ts                    # Van type: add last_gps_fix_at; RouteWithStatus: rename field

src/__tests__/
├── tracking/eta.test.ts              # Update VanPosition mocks
├── tracking/tracking-dedup.test.ts   # Add rpc mock to supabase client
└── time/is-location-fresh.test.ts    # Update future timestamp test expectation
```
