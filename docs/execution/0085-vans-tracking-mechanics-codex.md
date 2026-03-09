# CAAB Vans — Tracking System Mechanics

## Current Mechanics

The tracking system now has four separate concerns: ingest pings, maintain the van's latest position, infer stop progress, and expose route progress/ETA.

- Ingestion happens in `src/app/api/tracking/[vanId]/route.ts`. Each ping is token-authenticated, rate-limited, future-clamped to `+5 min`, rejected if older than 24 hours, and deduplicated on `(van_id, device_ts)` with `ignoreDuplicates`.
- The server optionally road-snaps the last few pings through OSRM `/match`, then atomically updates the van's latest position via `update_van_position`, so older pings cannot overwrite newer state.
- After a successful latest-position update, stop inference runs with both raw and snapped coordinates.

## Distance and ETA

There are now three distinct distance models.

- **Stop-passage distance** is geofence-based in `src/lib/tracking/infer-stop-progress.ts`. The engine chooses an effective position:
  - Raw GPS by default
  - Snapped GPS only if snap displacement is `<= 50m`

  Then it checks haversine distance against each stop's own geofence radius.

- **Live GPS ETA** is computed in `src/lib/tracking/eta.ts`. It activates only when GPS is fresh, the target stop has coordinates, and the van is either moving, within `500m` of the target stop, or was moving in the last `60s`.

- If OSRM `/route` responds, ETA uses road duration directly and returns `etaSource = "gps_osrm"`. If not, it uses `haversine * 1.3`, smoothed speed, and falls back to a crawl speed of `4.2 m/s` when hysteresis/proximity keeps GPS ETA active while the van is momentarily stopped.

- All live ETA paths are multiplied by a time factor from `src/lib/tracking/time-factors.ts`, which blends defaults or file-based route factors with recent same-run segments once there are at least 3 usable segments.

- If GPS ETA is unavailable, there is now a `segment` fallback before schedule fallback: it uses the last passed stop's stored `osrmDistanceM`, a reference speed, and the same time factor. The code explicitly notes that this is approximate if the chosen target stop is not the immediate successor of the last passed stop.

- Final fallback is still **schedule-shift ETA**: next stop scheduled time plus observed delay from the last passed stop.

## Stop Progress and Status

Stop progress is stricter and richer than before.

- Inference only runs when there is an active shift for today's `route_run`; pings alone do not advance stops.
- Pending stops are grouped by `stop_group_id` when present, otherwise by rounded coordinates — which fixes the old exact-coordinate-only repeated-stop behavior.
- Within each group, the engine only considers entries inside the geofence and not more than 30 minutes early, then picks the closest scheduled time to "now".
- Each passage gets `pass_source` and `pass_confidence`. Confidence is based on whether snapped/raw was used and how many raw pings entered the geofence in the last 5 minutes.
- Backfill still exists, but it is now gated: it only runs if confidence > 0.7 (requires multi-ping raw match), and backfilled stops get scaled confidence (0.7 for 1-stop gap, 0.5 for 2-3 stops, 0.3 otherwise) with `pass_source = "backfill"`.
- The engine now persists `last_passed_stop_id`, `next_stop_id`, and `progress_updated_at` onto `route_runs`.

## What the Public API Actually Serves

The route APIs now separate run state from telemetry freshness.

- `isRunning` is based only on `progress.runStatus === "in_progress"` in `src/app/api/routes/route.ts`. Freshness no longer turns a route off.
- Telemetry freshness is exposed separately as `trackingStatus`:
  - `live` — last fix < 10 minutes
  - `stale` — 10 to < 60 minutes
  - `missing` — absent, in the future, or >= 60 minutes
- Route progress is now assembled by `src/lib/tracking/resolve-route-progress.ts`, which:
  - Returns no progress for `waiting`, `idle`, or `completed`
  - Validates the persisted `next_stop_id` against stop existence, pending state, and pointer freshness (fresh up to 30 min, valid ceiling at 120 min)
  - Supports `legacy`, `shadow`, and `persisted` progress-source modes via `TRACKING_PROGRESS_SOURCE`

## Important Nuances

- The system now writes and reads persisted next-stop pointers by default (`persisted` mode). Legacy behavior is available via `TRACKING_PROGRESS_SOURCE=legacy`.
- `trackingStatus` can be `stale` or `missing` while `isRunning` is still `true`. That is now intentional.
- The confidence model for stop passage still counts raw recent pings, not snapped recent pings.
- The new `segment` ETA fallback is a useful intermediate tier, but it is not a full remaining-path ETA yet.
