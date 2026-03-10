# Quickstart: Cold-Start Stop Confirmation

**Branch**: `059-cold-start-confirm`

## Prerequisites

- Node.js and pnpm installed
- Supabase running locally (`docker compose up` in `infra/supabase/`)
- `.env.local` configured with Supabase URL and service role key
- At least one route with schedule entries that have coordinates (`stop_lat`/`stop_lng`)

## Development Setup

```bash
git checkout 059-cold-start-confirm
pnpm install
pnpm dev
```

## Testing the Feature

### 1. Simulate a Cold Start

1. Ensure a route exists with schedule entries starting early (e.g., 06:10)
2. Open the driver dashboard well past the first stop time (e.g., at 08:20)
3. Click "Iniciar Turno" — the start response should include `coldStart` if conditions are met

### 2. Test the Confirmation Flow

```bash
# Start a shift with GPS coordinates
curl -X POST http://localhost:3000/api/routes/{routeId}/start \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"lat": -12.9714, "lng": -38.5124}'

# Confirm the suggested stop
curl -X POST http://localhost:3000/api/routes/{routeId}/confirm-start-stop \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"stopId": "schedule-entry-uuid"}'
```

### 3. Verify in Database

```sql
-- Check route_run_stops after confirmation
SELECT schedule_entry_id, status, pass_source, pass_confidence
FROM route_run_stops
WHERE run_id = '{runId}'
ORDER BY schedule_entry_id;

-- Check route_run pointers
SELECT next_stop_id, last_passed_stop_id, progress_updated_at
FROM route_runs
WHERE id = '{runId}';
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/routes/[routeId]/start/route.ts` | Modified — accepts GPS coords, returns cold-start suggestion |
| `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` | New — confirmation endpoint |
| `src/lib/tracking/suggest-start-stop.ts` | New — two-pass suggestion algorithm |
| `src/lib/tracking/enforce-canonical-prefix.ts` | New — extracted shared helper |
| `src/lib/tracking/infer-stop-progress.ts` | Modified — uses extracted helper |
| `src/components/driver/route-card.tsx` | Modified — confirmation modal |

## Run Tests

```bash
pnpm vitest run --reporter=verbose
```
