# Quickstart: Fix ETA Computation

**Feature**: 044-fix-eta-computation
**Branch**: `044-fix-eta-computation`

## Prerequisites

- Node.js (see `.nvmrc`)
- Supabase local stack running (for integration tests, optional)
- OSRM instance URL in `OSRM_BASE_URL` env var (optional, for OSRM path testing)

## Key Files

| File | Role |
|------|------|
| `src/lib/tracking/eta.ts` | Main ETA computation — primary file to modify |
| `src/lib/tracking/osrm.ts` | OSRM client — no changes needed (already returns durationSeconds) |
| `src/lib/tracking/haversine.ts` | Distance calc — no changes needed |
| `src/lib/tracking/time-factors.ts` | Congestion factors — no changes needed |
| `src/app/api/routes/[routeId]/route.ts` | Route detail API — add recent pings query |
| `src/app/api/routes/route.ts` | Routes list API — add recent pings query |
| `src/__tests__/tracking/eta.test.ts` | ETA tests — update and add new cases |

## Development

```bash
# Install dependencies
npm install

# Run tests (watch mode)
npm test -- --watch

# Run specific test file
npm test src/__tests__/tracking/eta.test.ts

# Type check
npx tsc --noEmit

# Lint
npx eslint src/

# Build
npm run build
```

## What to Change (Summary)

1. **eta.ts**: Relax GPS branch entry condition — allow speed=0 when within 500m of next stop
2. **eta.ts**: Use `osrmResult.durationSeconds / 60` as base ETA instead of `distanceMeters / speedMps / 60`
3. **eta.ts**: Accept recent speed readings array; compute smoothed speed for haversine fallback
4. **Route APIs**: Query last 10 pings from `van_location_pings` and pass to `computeEta()`
5. **Tests**: Update existing tests, add new tests for all three fixes

## Testing Strategy

- Unit tests cover all ETA branches (existing 29 tests + new cases)
- Mock OSRM responses to test duration usage
- Test speed=0 proximity fallback with various distances
- Test smoothed speed with arrays of varying readings
- No database migration needed — no integration test changes required
