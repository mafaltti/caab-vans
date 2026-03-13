# Vans Stuck on Map — Root Cause Analysis

## How the System Works

1. Mobile tracker (Expo/React Native) collects GPS every 5s and POSTs to `/api/tracking/[vanId]`
2. Server stores ping in `van_location_pings`, updates `vans.last_lat`/`last_lng` atomically
3. Frontend polls `/api/routes/[routeId]` every 5 seconds, renders van marker on map
4. If no new pings arrive, the frontend keeps getting the same coordinates → van appears stuck

---

## Root Cause #1: Android OS Kills Background Task (CRITICAL)

Today's data proves it:

| Van | Pings today | Avg interval | Max gap | First ping |
|---|---|---|---|---|
| Van 01 | 2,056 | ~6s | normal | 12:17 UTC |
| Van 02 | 176 | 334s (5.5 min) | 15 min | 12:24 UTC |
| Van 03 | ~500 | variable | large gaps | 15:28 UTC (6h late) |
| Van 04 | ~200 | variable | large gaps | 16:04 UTC (10h late) |

Routes start at 06:10–06:40 local time. Vans 03 and 04 didn't even begin reporting until the afternoon. Van 02 has severe degradation with 5+ minute gaps between pings.

**Why:** Android OEM battery optimizers (Samsung, Xiaomi, Motorola, etc.) aggressively kill foreground services. The app has `killServiceOnDestroy: false` and a boot-restart receiver, but these aren't enough for aggressive OEMs.

**Fix:** Drivers must whitelist the CAAB Tracker app in their phone's battery optimization settings. Each OEM has a different path — see [dontkillmyapp.com](https://dontkillmyapp.com) for per-brand instructions. Consider adding an in-app prompt that checks and guides users to the correct settings screen.

---

## Root Cause #2: Client-Side Filters Drop Pings Too Aggressively (HIGH)

Three filters in `task.ts` combine to create long silence periods:

### a) Stationary throttle (`task.ts:277-279`)

```ts
if (distance === 0 && elapsed < STATIONARY_MAX_INTERVAL) {  // 60 seconds
    return; // ← silently drops ping
}
```

When GPS returns the same coordinates (van stopped at traffic light, slow traffic, GPS rounding), all pings are dropped for up to 60 seconds. This is the most common cause of short "stuck" episodes (30s–60s).

**Fix:** Reduce `STATIONARY_MAX_INTERVAL` from `60,000ms` to `15,000–20,000ms`. Even a stationary van should send a heartbeat every 15–20 seconds to keep the frontend alive.

### b) Stale fix guard (`task.ts:259-264`)

```ts
const staleThreshold = isColdGap && isStationary ? 120_000 : 60_000;
if (Date.now() - point.ts > staleThreshold) {
    return; // ← silently drops ping
}
```

If Android delays delivering a location callback by >60s (very common during doze mode), the point is dropped as "stale" even though it's the only data available. This creates a vicious cycle: Android delays → point stale → dropped → no update → van stuck longer → next point even staler.

**Fix:** Instead of dropping stale points, send them anyway but flag them (e.g., add a `stale: true` field). A 90-second-old position is better than no position at all.

### c) Distance + time throttle (`task.ts:281-283`)

```ts
if (distance < MIN_DISTANCE && elapsed < MIN_INTERVAL) {  // <5m and <3s
    return;
}
```

Minor contributor, but compounds with the above when GPS jitter keeps distance near zero.

---

## Root Cause #3: Staleness Warning Too Late (MEDIUM)

The UI only shows "Localização desatualizada" after 10 minutes (`STALENESS_THRESHOLD_MINUTES = 10` in `time.ts:13`). During those 10 minutes, users see a perfectly normal blue pulsing dot that just doesn't move — there's no visual cue that data is stale.

**Fix options:**

- Reduce `STALENESS_THRESHOLD_MINUTES` to 2–3 minutes
- Add a gradient opacity — dot starts fading after 30s without updates, becoming fully dimmed at 2–3 minutes
- Show a "last updated X seconds ago" timestamp on the map

---

## NOT a Root Cause: PostgREST Timeouts

The 3,800 "Thread killed by timeout manager" errors in PostgREST are benign — caused by a Kong keepalive idle timeout mismatch (Kong: 60s, Warp: 30s). All actual API requests succeed (verified: 2,127 × 200, zero errors). Can be silenced by setting `KONG_UPSTREAM_KEEPALIVE_IDLE_TIMEOUT: "25"` in `docker-compose`, but this has zero impact on the stuck van issue.

---

## Summary of Fixes (Priority Order)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Battery optimization whitelist — guide drivers to exclude CAAB Tracker from battery saver | Fixes Vans 02/03/04 going silent for minutes/hours | Low (driver instructions) |
| 2 | Reduce `STATIONARY_MAX_INTERVAL` from 60s → 15–20s | Eliminates 30–60s "stuck" episodes at stops/traffic | 1 line change |
| 3 | Relax stale fix guard — send stale points instead of dropping | Prevents feedback loop during Android doze | Small code change |
| 4 | Reduce `STALENESS_THRESHOLD_MINUTES` from 10 → 2–3 min | Users see "outdated" warning much sooner | 1 line change |
| 5 | Add "last seen" timestamp on map UI | Users understand the dot is stale, not broken | Small UI change |
| 6 | Silence PostgREST log noise — `KONG_UPSTREAM_KEEPALIVE_IDLE_TIMEOUT: 25` | Cosmetic, cleans up logs | Config change |

Fixes 1–3 address the actual root causes. Fixes 4–5 improve the user experience when data is inevitably stale. Fix 6 is optional cleanup.
