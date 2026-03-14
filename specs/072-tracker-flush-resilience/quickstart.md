# Quickstart: Tracker Flush Resilience

**Date**: 2026-03-13

## What this changes

Three bug fixes in the van-tracker background GPS service:

1. **Flush guard** — prevents concurrent buffer flushes that caused 3,613 duplicate pings on startup
2. **429 backoff** — applies existing exponential backoff to rate-limit responses (was only applied to 5xx)
3. **Geofence grace period** — suppresses OS-replayed geofence events for 15 seconds after cold start

## Files modified

| File | Change |
|------|--------|
| `apps/van-tracker/src/location/task.ts` | Add `isFlushing` guard; call `onSendFailure()` on 429 |
| `apps/van-tracker/src/location/geofence-task.ts` | Add boot timestamp check + in-memory dedup Map |

## How to verify

### Unit tests

```bash
cd apps/van-tracker
npx vitest run
```

### Manual device testing

1. Build with EAS: `eas build --profile development --platform android`
2. Start tracking with buffered pings, check diagnostic log for:
   - Only 1 `flush start` event per batch (not 200+)
   - `rate_limited` events followed by increasing backoff delays
   - Zero `geofence_enter` events in first 15s after cold start

### Reading diagnostic logs

Export from device via the tracker app's log export, or pull from AsyncStorage key `@diagLog`.

## No migrations or env changes

No database migrations, no new environment variables, no API changes.
