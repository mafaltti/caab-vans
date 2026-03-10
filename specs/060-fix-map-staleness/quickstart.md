# Quickstart: Fix Map Staleness

## Changes Overview

4 code changes across 3 files (tracker app + web app):

### 1. Reduce stationary throttle (tracker)
**File**: `apps/van-tracker/src/location/task.ts`
- Change `STATIONARY_MAX_INTERVAL` from `60_000` to `20_000`

### 2. Skip stale guard during cold gaps (tracker)
**File**: `apps/van-tracker/src/location/task.ts`
- When `isColdGap` is true, bypass the stale threshold check entirely
- Keep existing stale guard for normal (non-gap) operation

### 3. Reduce staleness warning threshold (web app)
**File**: `src/lib/time.ts`
- Change `STALENESS_THRESHOLD_MINUTES` from `10` to `3`
- Update test: `src/__tests__/time/is-location-fresh.test.ts`

### 4. Add "last updated" timestamp (web app)
**File**: `src/components/public/van-tracking-map.tsx`
- Thread `lastGpsFixAt` prop from parent
- Display relative time near the existing stale warning area

## Verification

```bash
# Type-check
npx tsc --noEmit

# Lint
npx eslint .

# Tests (update staleness test first)
npx vitest run

# Build
npx next build
```

## Manual Testing

1. **Stationary throttle**: Run tracker on stationary phone → verify pings arrive every ~20s (check `van_location_pings` table)
2. **Stale guard**: Simulate Android doze by pausing location updates for >2 min → verify next GPS point is sent, not dropped
3. **Staleness warning**: Stop tracker → verify "Localização desatualizada" appears on route page within ~3 minutes
4. **Last updated timestamp**: View route page → verify relative time shows below map (e.g., "há 30s", "há 2 min")
