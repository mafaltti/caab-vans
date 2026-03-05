# Quickstart: Fix Duplicate Pings

## Prerequisites

- Node.js 18+
- Access to Supabase self-hosted instance (for migration)
- Android device or emulator (for tracker testing)
- Expo CLI (`npx expo`)

## Development Setup

```bash
# 1. Checkout branch
git checkout 039-fix-duplicate-pings

# 2. Install dependencies (both projects)
npm install
cd apps/van-tracker && npm install && cd ../..

# 3. Run server locally
npm run dev

# 4. Run tracker app (separate terminal)
cd apps/van-tracker
npx expo start
```

## Migration

```bash
# Apply migration to Supabase (ensure DB backup first)
# The migration cleans up existing duplicates then adds the unique constraint
psql $DATABASE_URL -f supabase/migrations/00006_dedup_pings.sql
```

## Testing

### Server-side tests

```bash
npm test -- --run src/__tests__/tracking/tracking-dedup.test.ts
```

### Manual tracker testing

1. Build tracker APK: `cd apps/van-tracker && npx eas build --platform android --profile preview`
2. Install on device and start tracking
3. Park the van (leave device stationary) for 5 minutes
4. Check database: `SELECT count(*) FROM van_location_pings WHERE van_id = '{id}' AND device_ts > now() - interval '5 minutes'`
5. Expected: ~5 rows (1/min), not ~100

### Duplicate rejection test

```bash
# Send same ping twice
curl -X POST http://localhost:3000/api/tracking/{vanId} \
  -H "Content-Type: application/json" \
  -H "x-ingestion-token: {token}" \
  -d '{"deviceId":"test","lat":-12.97,"lng":-38.51,"accuracy":5,"speed":0,"heading":0,"ts":1740000000000}'

# Second call should return {"received":true,"duplicate":true,"ts":...}
curl -X POST http://localhost:3000/api/tracking/{vanId} \
  -H "Content-Type: application/json" \
  -H "x-ingestion-token: {token}" \
  -d '{"deviceId":"test","lat":-12.97,"lng":-38.51,"accuracy":5,"speed":0,"heading":0,"ts":1740000000000}'
```

## Quality Gates

```bash
# All must pass before PR
npm run lint
npm run typecheck
npm run build
npm test

cd apps/van-tracker
npm run lint
npm run typecheck
```

## Key Files

| File | Change |
|------|--------|
| `apps/van-tracker/src/location/task.ts` | Duplicate ts guard, stale fix guard, stationary suppression, cold-start hydration |
| `apps/van-tracker/src/location/tracking.ts` | timeInterval 3s→5s, distanceInterval 5m→10m |
| `apps/van-tracker/src/storage/buffer.ts` | Consecutive dedup in addToBuffer() |
| `src/app/api/tracking/[vanId]/route.ts` | Upsert, strict isNewest, staleness guard, move inferStopProgress inside isNewest |
| `supabase/migrations/00006_dedup_pings.sql` | Cleanup duplicates + unique constraint |
| `src/__tests__/tracking/tracking-dedup.test.ts` | New tests for server-side dedup logic |
