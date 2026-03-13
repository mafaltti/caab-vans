# Quickstart: 064-fix-false-advancement

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/tracking/process-device-geofence-events.ts` | Remove backfill block (L275-299), add contiguous-prefix guard before mark-as-passed (L256), add deferred-event logging |
| `src/app/api/tracking/[vanId]/route.ts` | Harden `appendGeofenceResponse` (L238-281) to use `enforceCanonicalPrefix` for ack filtering |
| `src/__tests__/tracking/process-device-geofence-events.test.ts` | Replace backfill test (L397-435), add 3 new tests (deferred, retry, multi-round) |

## New Files

| File | Purpose |
|------|---------|
| `src/__tests__/tracking/append-geofence-response.test.ts` | Unit tests for defense-in-depth ack logic |

## Key Dependency

- `src/lib/tracking/enforce-canonical-prefix.ts` — reused in route.ts (already used in 2 other files)

## Build & Test

```bash
# Run affected tests
npm test -- --run src/__tests__/tracking/process-device-geofence-events.test.ts
npm test -- --run src/__tests__/tracking/append-geofence-response.test.ts

# Full tracking test suite
npm test -- --run src/__tests__/tracking

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## Verification After Deploy

1. Monitor logs for `"deferred non-adjacent device geofence"` entries on CAAB/Forum segment
2. Confirm no false advancement: `next_stop_id` should not skip stops
3. Confirm deferred events eventually resolve when earlier stop is passed
