# Quickstart: Road Snapping for Van GPS Positions

**Feature**: 033-road-snapping
**Date**: 2026-03-03

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for self-hosted OSRM in Phase 2+)
- Running Supabase stack (`infra/supabase/`)
- Running Next.js dev server

## Phase 1: Development with OSRM Public Demo

During development, use the OSRM public demo server. No Docker setup needed.

### 1. Environment Variable

Add to `.env.local`:
```
OSRM_BASE_URL=https://router.project-osrm.org
```

> **Note**: The public demo has a 1 req/sec rate limit. This is fine for local development but not for production.

### 2. Database Migration

Run the migration to add snapped coordinate columns:
```bash
# Apply via Supabase CLI or directly against local Postgres
psql "$DATABASE_URL" -f supabase/migrations/00005_road_snapping.sql
```

### 3. Verify

1. Start the Next.js dev server: `npm run dev`
2. Send a test GPS ping to `POST /api/tracking/{vanId}`
3. Check the `vans` table — `snapped_lat` and `snapped_lng` should be populated if OSRM returns a match
4. Open the route detail page — the van marker should appear on the road

## Phase 2: Self-Hosted OSRM (VPS / Staging)

### 1. OSRM Docker Stack

```bash
cd infra/osrm
docker compose up -d
```

This downloads the Nordeste extract (~406 MB), processes it for OSRM (~15-30 min on first run), and starts the routing service on port 5000.

### 2. Environment Variable

Update `.env.local` (or VPS `.env`):
```
OSRM_BASE_URL=http://localhost:5000
```

### 3. Verify OSRM is Running

```bash
curl "http://localhost:5000/match/v1/driving/-38.5,-12.97;-38.51,-12.97?timestamps=1000;1010"
```

Should return a JSON response with `tracepoints` array.

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/00005_road_snapping.sql` | Adds `snapped_lat`/`snapped_lng` to `vans` |
| `src/lib/tracking/osrm.ts` | OSRM client (match API call + response parsing) |
| `src/app/api/tracking/[vanId]/route.ts` | Tracking ingestion (modified to call OSRM) |
| `src/app/api/routes/[routeId]/route.ts` | Route detail API (serves snapped coords) |
| `infra/osrm/docker-compose.yml` | OSRM Docker stack (Phase 2) |

## Testing

```bash
# Run type checks
npx tsc --noEmit

# Run linter
npx eslint .

# Run tests (if applicable)
npx vitest
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `snapped_lat` is always `NULL` | Check `OSRM_BASE_URL` is set and OSRM is reachable |
| OSRM returns 429 (rate limited) | Using public demo — reduce ping frequency or switch to self-hosted |
| Van marker still off-road | Check OSRM `/match` response in server logs — may be a data coverage gap |
| Geofence detection broken | Verify `inferStopProgress` uses `last_lat`/`last_lng` (raw), NOT snapped |
