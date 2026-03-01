# Quickstart: Stop Inference, ETA Computation & Tracking UI

**Feature**: `017-stop-inference-eta`
**Date**: 2026-03-01

## Prerequisites

- Node.js 18+ and npm/pnpm installed
- Supabase self-hosted instance running (with migration `00002_live_tracking.sql` already applied)
- Environment variables configured: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Setup

```bash
# Ensure you're on the feature branch
git checkout 017-stop-inference-eta

# Install dependencies (no new packages needed)
npm install
```

## Development

```bash
# Start the dev server
npm run dev

# Run type checking
npx tsc --noEmit

# Run linter
npx eslint .

# Run tests
npx vitest

# Run tests in watch mode
npx vitest --watch
```

## Testing the Feature

### Unit Tests

```bash
# Run all tracking-related tests
npx vitest src/__tests__/tracking/

# Run specific test file
npx vitest src/__tests__/tracking/haversine.test.ts
npx vitest src/__tests__/tracking/infer-stop-progress.test.ts
npx vitest src/__tests__/tracking/eta.test.ts
```

### Manual Testing

1. **Configure stop coordinates**: Open the admin panel, navigate to a route's schedule editor, and add lat/lng values to at least 2 stops.

2. **Send a tracking ping near a stop**: Use curl to simulate a ping within a stop's geofence:
   ```bash
   curl -X POST http://localhost:3000/api/tracking/{vanId} \
     -H "Content-Type: application/json" \
     -H "x-ingestion-token: {token}" \
     -d '{
       "deviceId": "00000000-0000-0000-0000-000000000001",
       "lat": -12.9714,
       "lng": -38.5124,
       "accuracy": 10,
       "speed": 5,
       "heading": 180,
       "ts": '$(date +%s000)'
     }'
   ```

3. **Verify progress in API**: Check that the route API now returns progress data:
   ```bash
   curl http://localhost:3000/api/routes/{routeId} | jq '.route.progress'
   ```

4. **Verify UI**: Open the route detail page and confirm ETA is displayed when progress data exists.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/tracking/haversine.ts` | Pure haversine distance function |
| `src/lib/tracking/infer-stop-progress.ts` | Stop inference logic |
| `src/lib/tracking/eta.ts` | ETA computation |
| `src/app/api/tracking/[vanId]/route.ts` | Tracking endpoint (inference wired here) |
| `src/app/api/routes/route.ts` | Route list API (progress added) |
| `src/app/api/routes/[routeId]/route.ts` | Route detail API (progress added) |
| `src/types/index.ts` | Extended TypeScript types |
| `src/components/public/hero-card.tsx` | ETA display on detail page |
| `src/components/public/route-card.tsx` | ETA display on list page |
| `src/components/public/schedule-timeline.tsx` | Inference-based stop progress |
| `src/components/admin/schedule-editor.tsx` | Admin lat/lng inputs |

## Quality Gates

Before submitting PR, ensure all pass:

```bash
npx eslint .           # Lint
npx tsc --noEmit       # Type-check
npm run build          # Build
npx vitest run         # Tests
```
