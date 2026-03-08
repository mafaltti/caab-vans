# Quickstart: Live Tracking Ingestion

## Prerequisites

- Node.js (see `.nvmrc` or `package.json` engines)
- Running Supabase instance (local or remote)
- Environment variables configured (`.env.local`)

## Setup

1. **Apply the migration:**

   Run `supabase/migrations/00002_live_tracking.sql` against your Supabase Postgres instance.

   For local development with Supabase CLI:
   ```bash
   supabase db reset
   ```

   For remote (manual):
   ```bash
   psql "$DATABASE_URL" -f supabase/migrations/00002_live_tracking.sql
   ```

2. **Start the dev server:**

   ```bash
   npm run dev
   ```

## Testing the Endpoint

### Get a van's ingestion token

Look up a van's `id` and `ingestion_token` in the admin panel or directly in the database.

### Send a test ping

```bash
curl -X POST http://localhost:3000/api/tracking/{VAN_ID} \
  -H "Content-Type: application/json" \
  -H "x-ingestion-token: {TOKEN}" \
  -d '{
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "lat": -12.9714,
    "lng": -38.5124,
    "accuracy": 8.5,
    "speed": 12.3,
    "heading": 180.0,
    "ts": 1717012345678
  }'
```

Expected response:
```json
{ "received": true, "ts": 1717012345999 }
```

### Verify data stored

Check the `van_location_pings` table for the new row and the `vans` table for updated `last_lat`/`last_lng`/`location_updated_at`.

## Quality Gates

```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript check
npm run build         # Next.js build
npm test              # Vitest (pass with no tests)
```

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/00002_live_tracking.sql` | Create | Database migration |
| `src/app/api/tracking/[vanId]/route.ts` | Create | Tracking endpoint |
| `src/lib/validators/tracking.ts` | Create | Zod validation schema |
| `src/types/index.ts` | Modify | Add new types + extend existing |
