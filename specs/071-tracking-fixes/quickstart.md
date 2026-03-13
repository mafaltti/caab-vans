# Quickstart: Tracking Reliability Fixes

**Branch**: `071-tracking-fixes`

## Files to Modify

| # | File | Change | Issue |
|---|------|--------|-------|
| 1 | `src/lib/tracking/process-device-geofence-events.ts` | Add `updateEventStatus` call in deferred guard | 3 |
| 2 | `src/lib/validators/tracking.ts` | Add `.max(100)` to `geofenceEvents` array | 4B |
| 3 | `src/app/api/tracking/[vanId]/route.ts` | Batch `.in()` query in `appendGeofenceResponse` | 4B |
| 4 | `src/app/api/routes/[routeId]/start/route.ts` | Reprocess `no_match` events after shift insert | 2 |

## Implementation Order

1. **Issue 3** first (1 line change, highest impact, unblocks Issue 2)
2. **Issue 4B** next (validation + batching, independent)
3. **Issue 2** last (depends on Issue 3's `no_match` marking)

## Quality Gates

```bash
npx eslint .
npx tsc --noEmit
npx next build
npx vitest run
```

## Verification

1. **Issue 3**: Monitor logs — `"deferred non-adjacent"` warnings should drop from ~16K to near-zero
2. **Issue 4B**: Test with 100+ geofence events — no 502 errors
3. **Issue 2**: Start a shift late after geofence events accumulated as `no_match` — verify reprocessing
