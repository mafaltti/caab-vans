# Quickstart: OSRM Route-Based ETA

**Feature**: 037-osrm-eta-baseline

## Prerequisites

- Node.js 18+ and npm
- Supabase self-hosted stack running (`supabase start` or Docker Compose)
- OSRM instance running (optional — feature degrades gracefully without it)

## Setup

1. **Ensure OSRM is configured** (if not already):
   ```bash
   # .env.local should have:
   OSRM_BASE_URL=http://localhost:5000
   ```
   If no OSRM, the feature falls back to haversine × 1.3 (current behavior).

2. **No migrations needed** — this feature adds no database tables or columns.

3. **Install dependencies** (if any new ones added):
   ```bash
   npm install
   ```

## Development

### Key files to modify:

| File | Change |
|------|--------|
| `src/lib/tracking/osrm.ts` | Add `osrmRoute()` function |
| `src/lib/tracking/eta.ts` | Make async, add OSRM branch + time factor |
| `src/lib/tracking/time-factors.ts` | New: factor lookup + recency blending |
| `src/types/index.ts` | Add `"gps_osrm"` to etaSource union |
| `src/app/api/routes/route.ts` | Pass OSRM URL, await computeEta |
| `src/app/api/routes/[routeId]/route.ts` | Pass OSRM URL, await computeEta |
| `scripts/compute-time-factors.ts` | New: nightly factor computation |

### Run locally:

```bash
npm run dev
```

### Verify OSRM route works:

```bash
# Direct OSRM test (van pos → stop pos):
curl "http://localhost:5000/route/v1/driving/-38.4567,-12.9876;-38.4789,-12.9654?overview=false"
```

### Run nightly script manually:

```bash
npx tsx scripts/compute-time-factors.ts
```

## Testing

```bash
# Type check
npx tsc --noEmit

# Lint
npx eslint .

# Tests
npx vitest

# Build
npx next build
```

## Verification Checklist

- [ ] With OSRM running: ETAs show `etaSource: "gps_osrm"` in API response
- [ ] With OSRM stopped: ETAs fall back to `etaSource: "gps"` (haversine)
- [ ] Without `OSRM_BASE_URL` env var: behavior identical to before this feature
- [ ] During rush hour (7-9 AM): ETAs are higher than off-peak for same distance/speed
- [ ] Comparison logs appear in server output with both haversine and OSRM distances
- [ ] Nightly script produces `data/time-factors.json` when run manually
