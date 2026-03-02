# Quickstart: GPS-Distance-Based ETA

**Feature**: 021-gps-distance-eta | **Date**: 2026-03-02

## Prerequisites

- Node.js + npm installed
- Supabase local stack running (Postgres with existing schema)
- Environment variables configured (`.env.local`)

## Development

```bash
# Install dependencies (if not already)
npm install

# Run dev server
npm run dev

# Run tests
npx vitest run

# Run only ETA tests
npx vitest run src/__tests__/tracking/eta.test.ts

# Type check
npx tsc --noEmit

# Lint
npx eslint .

# Build
npx next build
```

## Files Modified

| File | Change |
|------|--------|
| `src/lib/tracking/eta.ts` | Add `VanPosition` interface, GPS branch in `computeEta()`, `etaSource` to `EtaResult` |
| `src/types/index.ts` | Add `etaSource` to `RouteProgress` type |
| `src/app/api/routes/[routeId]/route.ts` | Fetch `last_speed_mps` + stop coords, build `vanPosition`, pass to `computeEta()` |
| `src/app/api/routes/route.ts` | Same wiring as route detail |
| `src/__tests__/tracking/eta.test.ts` | Add GPS ETA test block (8 test cases) |

## Verification Checklist

1. `npx vitest run` — all existing + new tests pass
2. `npx tsc --noEmit` — no type errors
3. `npx next build` — builds clean
4. Manual: with tracking simulator running, verify ETA updates between stops

## Key Design Decisions

- **GPS ETA formula**: `ETA = now + (haversine_distance × 1.3) / speed_mps / 60` minutes
- **Fallback**: When GPS conditions not met, schedule-delay logic unchanged
- **No frontend changes**: Same `etaNextStopMinutes` field; new `etaSource` is additive
