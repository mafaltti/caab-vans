# Quickstart: ETA System Hardening

**Feature**: 046-eta-system-hardening

## Prerequisites

- Node.js 18+ with `npx tsx` available
- Running Supabase instance with `DATABASE_URL` configured
- OSRM service running (optional but recommended) with `OSRM_BASE_URL` set

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/tracking/eta.ts` | Core ETA computation (hysteresis, speed smoothing, direction detection, debug logging) |
| `src/lib/tracking/time-factors.ts` | timeFactor blending, `buildRecentRuns()`, constants |
| `src/lib/tracking/haversine.ts` | Haversine distance + new bearing computation |
| `scripts/compute-time-factors.ts` | Calibration script for time-of-day factors |
| `src/app/api/routes/[routeId]/route.ts` | Route detail API (passes pings + distances to ETA) |
| `src/app/api/routes/route.ts` | Routes list API (same changes) |

## Development Workflow

### 1. Run existing tests

```bash
npx vitest run src/lib/tracking/__tests__/eta.test.ts
```

### 2. Enable debug logging (optional)

```bash
DEBUG_ETA=true npm run dev
```

### 3. Pre-compute OSRM distances

After the migration adds `osrm_distance_m` to `schedule_entries`:

```bash
OSRM_BASE_URL=http://localhost:5000 DATABASE_URL=... npx tsx scripts/precompute-stop-distances.ts
```

### 4. Run calibration script

Generates `data/time-factors.json` from historical data:

```bash
DATABASE_URL=... OSRM_BASE_URL=http://localhost:5000 npx tsx scripts/compute-time-factors.ts
```

Run periodically (monthly recommended) to update factors from real data.

### 5. Verify changes

```bash
npm run lint && npm run typecheck && npm run build && npx vitest run
```

## Testing Checklist

- [ ] Hysteresis: van stops for 45s at >500m, ETA stays GPS-based
- [ ] Hysteresis: van stops for >60s at >500m, ETA transitions to schedule
- [ ] Speed smoothing: single GPS spike does not inflate ETA by >10%
- [ ] timeFactor: with <3 passed stops, only historical factor is used
- [ ] Direction: van heading away from stop in haversine fallback triggers schedule fallback
- [ ] Debug log: `console.log` only fires when `DEBUG_ETA=true`
- [ ] Constants: `REFERENCE_SPEED_MPS` is 8.3 in both runtime and script
- [ ] Sunday factors: non-empty defaults present
