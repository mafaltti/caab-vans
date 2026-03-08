# ETA Configuration Guide

How the ETA system works and how to configure it based on the current codebase.

## Overview

The ETA system uses four layers:

1. GPS ETA from fresh tracker data
2. OSRM routing when `OSRM_BASE_URL` is configured and healthy
3. Segment fallback from stored per-stop road distances when GPS is stale
4. Time factors from built-in defaults or generated `data/time-factors.json`

All layers are optional and progressive. A fresh deployment works without OSRM or generated factor files.

## Layer 1: GPS ETA and OSRM Routing

### What it does

When the van has a fresh GPS fix and the next stop has coordinates, the server computes ETA from the current van position to the next target stop.

- If OSRM is configured and reachable, the server uses OSRM `/route` duration.
- If OSRM is disabled or times out, the server falls back to haversine distance times the road factor.

### How to enable

Add to `.env.local`:

```bash
OSRM_BASE_URL=http://localhost:5000
```

Optional timeout overrides:

```bash
OSRM_ROUTE_TIMEOUT_MS=300
OSRM_MATCH_TIMEOUT_MS=200
```

### Behavior

| Scenario | ETA source | Method |
|----------|------------|--------|
| Fresh GPS + OSRM reachable | `gps_osrm` | OSRM `/route` duration |
| Fresh GPS + OSRM disabled or timed out | `gps` | Haversine distance and speed heuristics |
| GPS stale + segment data available | `segment` | Stored `osrm_distance_m` plus time factor |
| GPS stale or unavailable with no segment path | `schedule` | Scheduled time plus observed delay |

### Notes

- Runtime defaults are `300ms` for `/route` and `200ms` for `/match`.
- Changing OSRM env vars requires restarting the Next.js process so the new environment is loaded.
- The `etaSource` field in the API response indicates which method was used.
- OSRM failures degrade gracefully.

## Layer 2: Segment-Aware Fallback

### What it does

When GPS is unavailable but stops have already been passed, the server uses stored per-segment road distances to estimate travel time to the next stop.

### How it works

The computation is:

```text
travelMinutes = (osrmDistanceM / REFERENCE_SPEED_MPS / 60) * timeFactor
```

Where:

- `osrmDistanceM` comes from `schedule_entries.osrm_distance_m`
- `REFERENCE_SPEED_MPS` is `8.3`
- `timeFactor` comes from the historical/default factor system

ETA is anchored to the last passed stop timestamp.

### Maintaining segment data

Whenever stop coordinates change, recompute per-stop road distances:

```bash
npx tsx scripts/precompute-stop-distances.ts
```

## Layer 3: Time-of-Day Correction Factors

### What it does

The server multiplies the base ETA by a correction factor based on hour and day-of-week.

### Sources

The system loads factors from:

1. `data/time-factors.json` if present
2. Built-in defaults from `src/lib/tracking/time-factors.ts`

### Built-in defaults

| Day type | Hour | Factor |
|----------|------|--------|
| Weekday | `6` | `1.05` |
| Weekday | `7` | `1.35` |
| Weekday | `8` | `1.40` |
| Weekday | `9` | `1.15` |
| Weekday | `16` | `1.10` |
| Weekday | `17` | `1.35` |
| Weekday | `18` | `1.30` |
| Weekday | `19` | `1.05` |
| Saturday | `8`, `9`, `10`, `17`, `18` | `1.05` to `1.10` |
| Sunday | `7`, `8`, `9`, `16`, `17`, `18` | `0.95` |

### Per-route overrides

The nightly script can write route-specific overrides when a route differs enough from the global pattern.

### Recency blending

When at least 3 recent segments exist for the current run, the runtime blends:

- `70%` historical factor
- `30%` recent observed factor

This logic lives in `src/lib/tracking/time-factors.ts`.

## Layer 4: Nightly Factor Refinement

### What it does

A standalone script analyzes the last 30 days of trip data and writes refined factors to `data/time-factors.json`.

### How to run

```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" npx tsx scripts/compute-time-factors.ts
```

Optionally pass `OSRM_BASE_URL` so the script uses road distance instead of haversine-based fallback:

```bash
DATABASE_URL="postgresql://..." OSRM_BASE_URL="http://localhost:5000" npx tsx scripts/compute-time-factors.ts
```

### How to automate

Example nightly cron:

```cron
30 23 * * * cd /path/to/caab-vans && DATABASE_URL="postgresql://..." OSRM_BASE_URL="http://localhost:5000" npx tsx scripts/compute-time-factors.ts >> /var/log/compute-factors.log 2>&1
```

### Output format

The script writes `data/time-factors.json` with this structure:

```json
{
  "generatedAt": "2026-03-04T23:30:00-03:00",
  "observationDays": 30,
  "minObservations": 20,
  "global": {
    "weekday": { "7": 1.35, "8": 1.4, "17": 1.35 },
    "saturday": { "9": 1.1 },
    "sunday": {}
  },
  "routes": {
    "route-uuid": {
      "weekday": { "7": 1.5, "8": 1.55 },
      "saturday": {},
      "sunday": {}
    }
  }
}
```

### Requirements

- `DATABASE_URL` pointing to the Supabase Postgres instance
- Optional `OSRM_BASE_URL`
- Enough `route_run_stops` history to make the output useful

### Notes

- `data/time-factors.json` is gitignored and environment-specific.
- The runtime reads this file on each API request, so replacing the file does not require restarting the app.
- If the file is missing or malformed, the system silently falls back to built-in defaults.

## Deployment Checklist

### Minimum

Nothing to do. The system works with haversine plus built-in time factors.

### Recommended

1. Set up and configure OSRM
2. Add `OSRM_BASE_URL` to the app environment
3. Recompute segment distances after stop-coordinate changes
4. Schedule the nightly factor job once you have enough historical data

## Monitoring

Check the `etaSource` field in API responses:

- `"gps_osrm"` means OSRM is working
- `"gps"` means the request fell back to non-OSRM GPS ETA
- `"segment"` means GPS was stale and segment fallback was used
- `"schedule"` means the final fallback was used

When `DEBUG_ETA=1`, server logs emit structured `eta_comparison` events with both haversine and OSRM calculations.
