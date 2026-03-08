# Quickstart: OSRM Configurable Timeouts

**Feature**: 050-osrm-configurable-timeouts

## What Changed

OSRM timeout values in `src/lib/tracking/osrm.ts` are now configurable via environment variables instead of being hardcoded. Default values have been increased for better production reliability.

## Configuration

Add to your `.env.local` (optional — defaults are sensible):

```bash
# OSRM timeouts (milliseconds). Defaults shown.
# OSRM_ROUTE_TIMEOUT_MS=300
# OSRM_MATCH_TIMEOUT_MS=200
```

### Before vs After

| Endpoint | Before (hardcoded) | After (default) | Env Variable |
|----------|-------------------|-----------------|--------------|
| `/route` (ETA) | 100ms | 300ms | `OSRM_ROUTE_TIMEOUT_MS` |
| `/match` (snap) | 50ms | 200ms | `OSRM_MATCH_TIMEOUT_MS` |

## Testing

```bash
# Run unit tests
npx vitest run src/__tests__/tracking/osrm-timeouts.test.ts

# Verify with custom values
OSRM_ROUTE_TIMEOUT_MS=500 OSRM_MATCH_TIMEOUT_MS=400 npm run dev
```

## Rollback

Set the env vars to the previous hardcoded values to restore old behavior:

```bash
OSRM_ROUTE_TIMEOUT_MS=100
OSRM_MATCH_TIMEOUT_MS=50
```
