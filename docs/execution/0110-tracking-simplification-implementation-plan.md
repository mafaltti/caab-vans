# Implementation Plan

## Summary

Simplify the tracking system around one rule: device geofence events and explicit manual actions are the only writers of stop progress. GPS pings remain for live position, ETA inputs, health, buffering, and offline recovery, but they no longer mutate `route_run_stops` or `route_runs`.

No schema migration is required for this cut. Existing tables and columns are sufficient. Historical `pass_source` values like `geofence_raw`, `geofence_snapped`, and `backfill` remain in old data, but no new writes should use them.

---

## Core Changes

- Make device geofence the sole automatic progression engine in `process-device-geofence-events.ts` and manual confirmation the sole explicit fallback in `confirm-start-stop/route.ts`.
- Remove all runtime calls to `inferStopProgress()` from the main and batch ingestion routes in `tracking/[vanId]/route.ts` and `tracking-batch/[vanId]/route.ts`. GPS ingestion continues to store pings, snap for ETA if desired, and update latest position, but never passes stops.
- Extract one shared helper that recomputes canonical contiguous progress from `route_run_stops`, heals any unexpected non-contiguous rows, and persists `last_passed_stop_id`, `next_stop_id`, and `progress_updated_at` on `route_runs`. Call this helper only from device-geofence processing and manual confirmation.
- Seed `route_run_stops` at shift start in `routes/[routeId]/start/route.ts`, and initialize `next_stop_id` to the first pending stop so the read side has a stable pointer before the first geofence event.
- Keep soft GPS corroboration inside device-geofence processing for confidence/logging only. A valid in-order device event is not blocked by missing corroboration. `geofence_radius_m` remains a server-side corroboration radius, not a progression radius.
- Remove the same-request "retry deferred geofence after GPS inference" branch from the main tracking route. Deferred events are retried on later pings or resolved by manual confirm, not by a second progress engine in the same request.

---

## Read-Side Simplification

- Remove the `TRACKING_PROGRESS_SOURCE` rollout branching from `resolve-route-progress.ts`. The resolver should always use persisted progress.
- Keep a single self-heal fallback in the resolver: if `next_stop_id` is missing or invalid, derive it once from current contiguous `route_run_stops`, persist the repaired pointer, log `progress_pointer_healed`, and continue. Do not keep legacy/shadow mode after this cut.
- Keep ETA logic and stale-GPS schedule fallback. ETA should target the persisted `next_stop_id` only. Do not re-derive the next stop from live GPS.
- Keep `trackingStatus` vs `runStatus` split. That separation is legitimate complexity and should not be collapsed.

---

## Mobile Tracker Changes

- Keep the background location task, buffering, backoff, and batch flush in `task.ts`. Those are necessary operational safeguards.
- Keep the device geofence task and selective ack flow. `processedEventIds` and `configVersion` stay in the wire contract.
- Fix config resync so a `configVersion` mismatch re-fetches config and immediately re-registers geofences, instead of only caching the new values.
- Standardize device geofence radii in the tracker-config response: effective radius per `placeId` is `min(non-null configured values in that group)`, clamped to `100–150m`, with `150m` default. If grouped entries disagree, log a structured warning and use the effective minimum. This makes device radius explicitly per geofence region, not per repeated schedule row.
- Keep GPS pings for map dot, freshness, and ETA inputs. Do not attempt a "geofence-only app" with no live position telemetry.

---

## Ops and Cleanup

- Run a one-time reconciliation for active runs during rollout: seed missing `route_run_stops`, recompute contiguous prefix, and persist repaired route-run pointers.
- Remove `TRACKING_PROGRESS_SOURCE` from deployment docs and environment configuration.
- Update docs so the official model is: **GPS for telemetry, device geofence for progression, manual confirm for fallback.**
- Add structured metrics/logging for `device_geofence_matched`, `device_geofence_deferred`, `device_geofence_no_match`, `manual_progress_confirm`, `progress_pointer_healed`, and `geofence_config_reregistered`.

---

## Test Plan

- Main tracking route stores pings and updates latest position, but a GPS-only ping never changes stop status or route-run pointers.
- Batch tracking route replays history without changing stop status or route-run pointers.
- Device geofence event for the first pending stop marks it passed, updates pointers, and returns the event ID in `processedEventIds`.
- Non-adjacent device geofence event is deferred and remains retryable until earlier stops are passed by device geofence or manual confirmation.
- Duplicate device geofence events remain idempotent.
- Shift start seeds `route_run_stops` and initializes `next_stop_id`.
- Manual confirm still advances progress correctly and remains the official missed-geofence fallback.
- Resolver uses persisted progress by default and self-heals once when the pointer is missing or invalid.
- Config-version mismatch causes live geofence re-registration on the tracker.
- Conflicting grouped device radius values produce the expected effective radius and warning log.

---

## Assumptions Chosen

- Official missed-geofence fallback is manual confirmation, not automatic skip.
- Device geofence is authoritative for stop passage; GPS corroboration is soft and non-blocking.
- Device geofence radius values below `100m` are not supported in the clean architecture.
- ETA/OSRM quality improvements are out of scope for this simplification cut unless they are required to remove a direct dependency on GPS stop inference.
