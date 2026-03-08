# Quickstart: Tracking Inference Fixes

**Feature**: 051-tracking-inference-fixes
**Branch**: `051-tracking-inference-fixes`

## Prerequisites

- Node.js 18+
- Local Supabase running (Docker)
- OSRM service running (optional, for segment distance features)

## Key Files

| Area | File | Change |
|------|------|--------|
| Types | `src/types/index.ts` | Add `TrackingStatus`, `PassSource`, extend `RouteProgress`, `RouteWithStatus` |
| Inference | `src/lib/tracking/infer-stop-progress.ts` | Confidence gating, stop grouping, hybrid position, persist progress |
| ETA | `src/lib/tracking/eta.ts` | Segment-aware fallback tier |
| Routes API | `src/app/api/routes/route.ts` | Decouple `isRunning`, add `trackingStatus`, read persisted pointers |
| Routes API | `src/app/api/routes/[routeId]/route.ts` | Same as above |
| Admin API | `src/app/api/admin/vans/route.ts` | Expose tracker health |
| Tracking API | `src/app/api/tracking/[vanId]/route.ts` | Pass snapped coords to inference |
| Tracking Batch API | `src/app/api/tracking-batch/[vanId]/route.ts` | Pass snapped coords to inference (same change) |
| Validator | `src/lib/validators/schedule-entry.ts` | Accept `stopGroupId` |
| Schedule API | `src/app/api/admin/routes/[routeId]/schedule/route.ts` | Accept/return `stopGroupId` |
| Migration | `supabase/migrations/00011_stop_confidence_metadata.sql` | `pass_source`, `pass_confidence` on `route_run_stops` |
| Migration | `supabase/migrations/00012_stop_group_id.sql` | `stop_group_id` on `schedule_entries` |
| Migration | `supabase/migrations/00013_persist_progress_pointers.sql` | Progress pointers on `route_runs` |
| Tests | `src/__tests__/tracking/infer-stop-progress.test.ts` | Confidence gating, grouping, hybrid position tests |
| Tests | `src/__tests__/tracking/eta.test.ts` | Segment-aware fallback tests |
| Tests | `src/__tests__/tracking/routes-api.test.ts` | API response shape: `trackingStatus`, `isRunning`, `isTrackingFresh` |
| Docs | `docs/ETA-CONFIGURATION.md` | Update to reflect segment-aware fallback and current OSRM timeouts |

## Setup

```bash
# Checkout the feature branch
git checkout 051-tracking-inference-fixes

# Install dependencies
npm install

# Run migrations
npx supabase db push

# Run tests
npm test

# Type check
npx tsc --noEmit

# Start dev server
npm run dev
```

## Implementation Order

1. **Migrations first** — Deploy schema additions (all nullable, no breaking changes)
2. **Types** — Add `TrackingStatus`, `PassSource`, extend existing types
3. **Decouple isRunning** — Remove GPS freshness from `isRunning`, add `trackingStatus` field
4. **Confidence gating** — Modify `inferStopProgress` for confidence-gated backfill
5. **Stop grouping** — Add `stop_group_id` support to inference and admin APIs
6. **Hybrid position** — Pass snapped coords to inference (both single and batch endpoints), apply displacement threshold
7. **Persist progress** — Write pointers during ingestion
8. **Segment ETA** — Add fallback tier to `computeEta`
9. **Admin health** — Expose tracker health in admin van endpoints
10. **Read persisted pointers** — Switch route APIs to read from `route_runs`
11. **Tests** — Extend test suites for each change (including API response shape tests)
12. **Doc updates** — Update `docs/ETA-CONFIGURATION.md` to reflect segment-aware fallback

## Testing

```bash
# Run all tracking tests
npx vitest run src/__tests__/tracking/

# Run specific test file
npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts
npx vitest run src/__tests__/tracking/eta.test.ts

# Type check
npx tsc --noEmit

# Lint
npx eslint src/
```

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `TRACKING_LIVE_THRESHOLD_MINUTES` | 10 | New constant |
| `TRACKING_STALE_THRESHOLD_MINUTES` | 60 | New constant |
| `SNAP_DISPLACEMENT_THRESHOLD_M` | 50 | `infer-stop-progress.ts` |
| `CONFIDENCE_PING_WINDOW_MINUTES` | 5 | `infer-stop-progress.ts` |
| `REFERENCE_SPEED_MPS` | 8.3 | `time-factors.ts` (existing) |
| `GEOFENCE_RADIUS_M` | 50 | `schedule_entries.geofence_radius_m` (existing) |

## Reference Documents

- [Spec](./spec.md) — Feature specification with acceptance scenarios
- [Research](./research.md) — Technical decisions and rationale
- [Data Model](./data-model.md) — Schema changes and computed types
- [API Contracts](./contracts/api-changes.md) — API response changes
- [Best Fixes Analysis](../../docs/execution/0078-tracking-best-fixes-codex.md) — Original analysis
- [Implementation Plan Analysis](../../docs/execution/0079-tracking-implementation-plan-codex.md) — Original plan
