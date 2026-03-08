# Tracking System — Code Review Findings

## Findings

### 1. `location_updated_at` Models the Wrong Thing

Delayed/offline pings can be shown as live GPS. The tracking endpoints accept pings up to 24 hours old, then stamp the van row with server `now()` instead of the ping's `device_ts` (`tracking route:85`, `tracking route:202`, `tracking-batch route:87`, `tracking-batch route:211`). The public APIs then treat that field as freshness for ETA and "is running" decisions (`time.ts:16`, `routes route:88`, `routes route:123`).

It is also the same column originally used for the legacy `location_url` ingest path (`00001_initial_schema.sql:14`, `ingest route:68`).

**Result:** a backlog flush or a legacy `location-url` update can make stale coordinates look fresh and drive GPS ETA incorrectly.

### 2. Current-Position Projection on `vans` Is Race-Prone

Can regress under concurrent ingest. Both ingest endpoints read `previousLatest` first, decide `isNewest` from that snapshot, and then unconditionally update `vans` if the snapshot comparison passes (`tracking route:90`, `tracking route:159`, `tracking-batch route:70`, `tracking-batch route:167`). If `t3` and `t2` arrive concurrently after `t1`, both can see `t1` as latest and whichever request writes last wins, even if it is older.

**Result:** the immutable ping log stays correct, but the live map/ETA state on `vans` can move backwards.

### 3. Stop-Progress Inference Not Gated by Route Lifecycle

Ignores the ping's service day. Every newest ping calls `inferStopProgress`, which upserts `route_runs` for `todayBahiaDate()` and marks stops passed even if no driver has started a shift (`tracking route:210`, `tracking-batch route:219`, `infer-stop-progress.ts:44`, `infer-stop-progress.ts:188`). The explicit start flow exists, but the ingest path does not consult it (`start route:95`).

**Result:** pre-start movement, parked-at-stop pings, or an overnight buffered flush can mutate today's run before the route is actually in progress.

### 4. Sequence-Gap Telemetry Not Tied to Route/Session Boundary

The tracker has a `resetSequence()` hook "called on route start", but nothing calls it (`task.ts:410`). The start-route API is server-only and has no coupling to the mobile tracker (`start route:9`).

**Result:** `seq` is good for app-session ordering, not for per-run loss detection — the telemetry is noisy and partially meaningless.

### 5. OSRM Timeouts Too Aggressive for Production

Snapping and OSRM ETA will fail often and silently degrade to haversine. `route` aborts after 100ms and `match` after 50ms (`osrm.ts:19`, `osrm.ts:69`). That might work on an unloaded local host, but is not a robust operating assumption for a VPS/container boundary or transient load.

---

## Assessment

The overall direction is sound: local buffering on device, immutable ping history, idempotent dedup by `(van_id, device_ts)`, and derived public state is the right foundation.

It is not the best version of that approach yet. The main problem is that "current state" and "route progress" are being projected inside the ingest request with weak lifecycle and timestamp semantics. That is where the critical bugs are.

---

## Verification

Ran:

```
npm test -- --run \
  src/__tests__/tracking/tracking-dedup.test.ts \
  src/__tests__/tracking/infer-stop-progress.test.ts \
  src/__tests__/tracking/eta.test.ts \
  src/__tests__/time/is-location-fresh.test.ts
```

**Result: 75 tests passed.**

The current tests are good for ETA math and dedup behavior, but they do not cover:

1. Concurrent ingest races
2. Delayed/offline batch flush freshness
3. Pre-shift or overnight progress mutation

---

## Next Steps

1. Add a real GPS timestamp field on `vans` such as `last_device_ts`, and update the live projection atomically in SQL/RPC only when the incoming `device_ts` is newer.
2. Split `location_updated_at` into separate fields for `location_url`, `gps_received_at`, and `gps_device_ts`; use `gps_device_ts` for freshness/ETA.
3. Pass `deviceTs` into `inferStopProgress`, derive `service_date` from that timestamp, and gate progress updates behind an active shift.
4. Either wire `resetSequence()` to route start or replace raw `seq` with a per-run/session identifier plus sequence.
5. Relax OSRM timeouts and add metrics for snap success rate, route success rate, and fallback frequency.
