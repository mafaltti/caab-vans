# Tracking System — Architecture Note & Gap/Risk Review

## Architecture Note

The tracking system has four stages.

### 1. Ingestion

The tracker app posts GPS points to `src/app/api/tracking/[vanId]/route.ts` or the batch variant at `src/app/api/tracking-batch/[vanId]/route.ts`. The server validates payloads, clamps bad future timestamps, drops very old points, deduplicates by `(van_id, device_ts)`, and stores raw history in `van_location_pings`.

### 2. Latest Position

After storing a ping, the server optionally road-snaps the recent trajectory through OSRM in `src/lib/tracking/osrm.ts`, then calls the atomic DB RPC from `supabase/migrations/00009_atomic_van_position.sql` so only newer GPS fixes can replace the van's current position.

### 3. Stop Progress

`src/lib/tracking/infer-stop-progress.ts` looks up today's `route_run`, requires an active `route_shift`, checks pending stops with coordinates, and marks a stop passed when the raw ping enters that stop's geofence. Repeated stops at the same coordinates are resolved by closest scheduled time, with a 30-minute early-arrival guard. Earlier pending stops are backfilled as passed.

### 4. Public API Assembly

`src/app/api/routes/route.ts` and `src/app/api/routes/[routeId]/route.ts` combine route schedule, latest van position, shift/run status, inferred passed stops, and ETA from `src/lib/tracking/eta.ts`. The UI only treats a route as actively running when the van is within the schedule window, GPS is fresh, and the run has an active shift.

### ETA Modes (`src/lib/tracking/eta.ts`)

ETA has two modes:

- **GPS ETA** _(preferred)_: fresh GPS, next stop has coordinates, and the van is moving, near the stop, or was recently moving. Uses OSRM route duration when available; otherwise uses `haversine * 1.3`, smoothed speed, and a time-of-day factor from `src/lib/tracking/time-factors.ts`.
- **Schedule ETA** _(fallback)_: if GPS is stale or untrustworthy, ETA becomes next stop scheduled time shifted by the observed delay from the last passed stop.

---

## Gap / Risk Review

The main risks are **model mismatch**, **stale-state suppression**, and **inference coupling**.

### Coordinate Source Mismatch

Stop passing is based on raw GPS in `src/lib/tracking/infer-stop-progress.ts`, while ETA/display can use snapped coordinates from `src/app/api/routes/route.ts`. That can create cases where the map looks correct but the stop does not pass, or vice versa.

### Stale GPS Drops Running State

`isRunning` is gated by fresh GPS and schedule window in `src/app/api/routes/route.ts`. If GPS goes stale for more than `10 minutes`, the route can drop out of "running" even if a driver shift is still active and progress exists. That is probably intentional UX, but it can look like the run stopped.

### Weak Schedule Fallback ETA

Schedule fallback ETA assumes a uniform delay across the remaining route in `src/lib/tracking/eta.ts`. This is stable, but it is weak when congestion varies sharply by segment.

### ETA Target Depends on Stop Inference

GPS ETA depends on the next stop being correctly inferred first. If `nextStopId` lags or backfill marks too much, ETA will still compute cleanly but for the wrong target stop.

### Repeated-Stop Grouping Limitation

Repeated-stop handling relies on same-coordinate grouping plus closest scheduled time in `src/lib/tracking/infer-stop-progress.ts`. If two nearby but not identical stops should logically be treated as one place, the grouping will not catch that.

### Aggressive Backfill

Once a later stop is matched, all earlier pending stops are marked passed. That is useful for mid-route starts, but if one stop is falsely matched, the error propagates backward immediately.

### OSRM Fails Open

OSRM is optional and fails open. That is good operationally, but ETA quality can change materially depending on whether OSRM is up, since the fallback is only `haversine * 1.3` in `src/lib/tracking/eta.ts`.

### Docs/Runtime Timeout Mismatch

`docs/ETA-CONFIGURATION.md` still mentions a `100ms` OSRM timeout, while `src/lib/tracking/osrm.ts` uses `300ms` for `/route` and `200ms` for `/match`.

### Tracker Health Not Surfaced Publicly

Tracker health exists in `src/lib/tracking/tracker-health.ts`, but the public route APIs do not appear to surface those health diagnostics directly. Operators can detect stale/buffering trackers, but riders likely only see degraded route state indirectly.

---

## Summary

The system is structurally solid: ingestion is idempotent, latest-position updates are atomic, and ETA has a controlled fallback path. The highest-value improvements would be:

1. Unifying raw vs. snapped coordinate logic for stop inference
2. Making stale-run UX clearer
3. Reducing the blast radius of false-positive stop matches
