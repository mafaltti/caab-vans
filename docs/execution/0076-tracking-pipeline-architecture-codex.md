# Tracking Pipeline Architecture

## End-to-End

The tracking pipeline is:

`tracker app` → `/api/tracking` or `/api/tracking-batch` → `store ping` → `optional OSRM snap` → `atomic van latest-position update` → `stop inference` → `/api/routes*` builds public progress

### Key Runtime Points

- Single pings and batch pings are validated, future timestamps are clamped to `+5 min`, and pings older than `24h` are rejected or skipped (`tracking route`, `batch route`).
- Duplicates are suppressed by `upsert ... onConflict(van_id, device_ts)` plus a unique DB index (`tracking route`, `migration 00006`).
- The van's latest position is updated atomically only if the ping is newer than `last_gps_fix_at`, so out-of-order pings do not roll the van backwards (`migration 00009`).

---

## ETA / Distance

There are two different distance mechanics:

- **Stop detection** uses raw GPS + haversine distance to each stop geofence. Each stop has `geofence_radius_m`, default `50m` (`migration 00002`, `infer-stop-progress`).
- **ETA** uses the van's latest displayed position, preferring snapped coordinates if OSRM road matching succeeded (`routes API`).

### ETA Branch Selection (`eta.ts`)

GPS ETA is used **only if** location is fresh (`<10 min`), next stop has coordinates, and one of these is true:

- `speed >= 1.0 m/s`
- van is within `500m` of the next stop
- a recent ping in the last `60s` had `speed >= 1.0 m/s`

**If GPS ETA is active:**

- with OSRM: use `/route` duration directly
- without OSRM: use `haversine * 1.3` as road approximation

**Speed smoothing:**

- Speed is smoothed with the median of recent non-zero speeds.
- If the van is temporarily stopped but GPS ETA is still allowed, it uses a fallback speed of `4.2 m/s` (~`15 km/h`).

**Heading check:**

- If heading is more than `90°` away from the stop bearing, the non-OSRM GPS ETA is rejected and it falls back to schedule.

**Time factor blending:**

- After base travel time is computed, it is multiplied by a time factor from historical defaults or `data/time-factors.json`.
- Optionally blended `70/30` with today's observed segment performance once there are at least `3` passed segments (`time-factors`).

### Schedule Fallback

If GPS ETA is not trusted, ETA becomes:

> scheduled next stop time + observed delay from last passed stop (`eta fallback`)

---

## Stop Progress / Route Status

Stop inference only runs if there is an active driver shift for today's route run. Pings alone do not advance stops (`infer-stop-progress`, `start shift`).

### Mechanics

- Stops are seeded into `route_run_stops` on first use.
- Pending stops are grouped by identical coordinates.
- For repeated stops at the same coordinates, the system picks the pending occurrence closest in time, but only if the stop is within the `30 min` early-arrival window.
- Once a stop is matched, all earlier pending stops are backfilled as passed (`infer-stop-progress`).

### Public "Running" State

Public `running` state is stricter than "has progress":

- `isRunning` = within schedule window **AND** location fresh **AND** `runStatus === in_progress` (`routes API`)

`runStatus` itself comes from shifts:

| Condition | Status |
|---|---|
| No shifts | `waiting` |
| Active shift | `in_progress` |
| Shifts ended and schedule passed | `completed` |
| Shifts ended but schedule not passed | `idle` |

(`run-status`)

---

## Notable Observations

- The doc says OSRM fallback happens if it is slow over `100ms`, but runtime code currently uses `300ms` for `/route` and `200ms` for `/match` (`ETA doc`, `osrm.ts`).
- Stop inference uses raw GPS coordinates, while ETA/map output can use snapped coordinates. That split is intentional in the current code path, but it means "passed stop" and "displayed van position" are not derived from the exact same point (`tracking route`, `routes API`).
- This is **not real-time traffic ETA**. OSRM provides static road geometry/duration; the dynamic part comes from time-of-day factors and same-run segment blending.

---

*If you want, I can turn this into a shorter architecture note or a gap/risk review of where ETA can still drift.*
