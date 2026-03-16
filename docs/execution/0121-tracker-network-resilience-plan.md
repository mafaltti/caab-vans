# Tracker Network Resilience — Implementation Plan (Fixes A–G)

## Context

Van 04 got stuck on the map: 2,104 GPS pings generated but `buffer_size=100` all day. Three compounding gaps create a self-reinforcing failure loop when cellular connectivity is spotty:

1. **No active network recovery** — only `NetInfo.fetch()` poll inside callbacks, no listener
2. **Buffer flush gated on real-time success** — `flushBuffer()` never called on 429/5xx paths
3. **Backoff never resets on reconnect** — only `onSendSuccess()` resets it

All claims validated against code. Spec: `docs/execution/0120-tracker-network-resilience.md`

---

## Implementation Order

```
Pre-req: Extend EventType ─┐
                            ├─► Phase 1: C → A → B  (core resilience)
                            ├─► Phase 2: F → E       (autonomous recovery)
                            └─► Phase 3: D → G       (hardening)
```

Each phase is independently shippable. Within each phase, order matters (dependencies noted).

---

## Pre-requisite: Extend EventType

**File:** `apps/van-tracker/src/storage/diag-log.ts` (lines 24–38)

Add 3 new event types to the union:

- `"net_recovery"` (Fix A)
- `"health_recovery"` (Fix E)
- `"failure_notification_sent"` (Fix F)

---

## Phase 1: Core Network Resilience (A + B + C)

### Fix C — Cap Backoff at 60s

**File:** `apps/van-tracker/src/location/task.ts`, line 54

```ts
// BEFORE:
[5000, 10000, 30000, 60000, 120000, 300000]  // 5s→5min

// AFTER:
[5000, 10000, 20000, 30000, 45000, 60000]    // 5s→60s
```

1 line change. No dependencies.

### Fix A — NetInfo Listener to Reset Backoff on Reconnect

**Files:**
- `apps/van-tracker/src/location/task.ts` — main changes
- `apps/van-tracker/src/location/tracking.ts` — teardown on stop

**Changes in `task.ts`:**

1. New module-level state (after line 47):

```ts
let netInfoUnsubscribe: (() => void) | null = null;
let lastKnownConnected: boolean | null = null;
```

2. New function `setupNetInfoListener()` (before `TaskManager.defineTask()`, ~line 175):
   - Subscribe via `NetInfo.addEventListener()`
   - Track `lastKnownConnected` to detect off→on transitions
   - On reconnect: guard `authPaused` + `isFlushing`, reset `consecutiveFailures=0` and `backoffUntil=0`, persist, log `"net_recovery"`, attempt `flushBuffer()`
   - Async work in fire-and-forget IIFE (listener expects sync callback)

3. New export `teardownNetInfoListener()`: unsubscribes, resets `lastKnownConnected`

4. Call `setupNetInfoListener()` in cold-start hydration block (after `logEvent("cold_start")`, line 254)

**Changes in `tracking.ts`:**
- Extend import: `import { BACKGROUND_LOCATION_TASK, teardownNetInfoListener } from "./task"`
- Call `teardownNetInfoListener()` in `stopTracking()` (before `setTrackingEnabled(false)`)

### Fix B — Flush on 429/5xx Failure

**File:** `apps/van-tracker/src/location/task.ts`

After the 429 error branch (~line 383) and the 5xx error branch (~line 403), add:

```ts
if (!isFlushing) {
  try { await flushBuffer(settings, deviceId); } catch { /* non-fatal */ }
}
```

> Do **NOT** add in `NetworkError` catch — no network means the batch will also fail.

---

## Phase 2: Autonomous Recovery (E + F)

### Fix F — Local Notification on Prolonged Failure

**File:** `apps/van-tracker/src/location/task.ts`

1. New import: `import * as Notifications from "expo-notifications"`
2. New module-level state: `FAILURE_NOTIFICATION_THRESHOLD = 10`, `failureNotificationSent = false`
3. New helper `sendFailureNotification()`: schedules immediate HIGH-priority notification (`"Location updates are failing. Check your connection."`), logs `"failure_notification_sent"`, sets flag
4. **Trigger:** Inside backoff check block (lines 319–326), if `consecutiveFailures >= threshold`, call `sendFailureNotification()`
5. **Reset:** `failureNotificationSent = false` in `onSendSuccess()`

No persistence needed — process restart naturally resets the flag. `expo-notifications` already installed (v55.0.10).

### Fix E — Background Fetch Health Check

**New dependency:** `expo-background-fetch` (install via `npx expo install expo-background-fetch`)

**New file:** `apps/van-tracker/src/location/health-check-task.ts`

- `TaskManager.defineTask("health-check-task", ...)`: checks if tracking enabled, if location task running, if last invocation is stale (>10 min). Restarts tracking if needed.
- `registerHealthCheck()`: registers with 15-min minimum interval, `stopOnTerminate: false`, `startOnBoot: true`
- `unregisterHealthCheck()`: cleans up registration
- Uses `dynamic import("./tracking")` to avoid circular dependency

**Integration points:**

- `apps/van-tracker/app/_layout.tsx`: add `import "@/location/health-check-task"` (line 3, follows existing pattern on lines 1–2)
- `apps/van-tracker/src/location/tracking.ts`:
  - Import `registerHealthCheck`, `unregisterHealthCheck`
  - Call `registerHealthCheck()` in `startTracking()` (after battery listener, non-fatal try/catch)
  - Call `unregisterHealthCheck()` in `stopTracking()` (before `setTrackingEnabled(false)`, non-fatal try/catch)

---

## Phase 3: Hardening (D + G)

### Fix D — Buffer Capacity 100 → 500

**Files:**
- `apps/van-tracker/src/storage/buffer.ts`, line 5: `MAX_BUFFER_SIZE = 500`
- `apps/van-tracker/src/location/task.ts`: replace single-shot flush with chunked logic

**Chunked flush in `flushBuffer()`** (replaces lines 131–158):

- Send in chunks of 100 (`CHUNK_SIZE = 100`)
- Sequential sends (not parallel) to respect rate limits
- Track `totalSent` counter
- On 429/5xx/`NetworkError`: break loop, keep remaining in buffer
- On 401: break (stop sending with bad token)
- On success: increment `totalSent`, call `onSendSuccess()`
- After loop: single `removeFromBuffer(totalSent)` call
- 500 points ~75KB JSON — well within AsyncStorage 6MB limit

### Fix G — GPS Restart on Reconnect

**File:** `apps/van-tracker/src/location/task.ts`

New import: `import * as Location from "expo-location"`

Extend `setupNetInfoListener()` (inside Fix A's reconnection handler, after flush):

```ts
const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
if (!isRunning) {
  logEvent("net_recovery", "restarting_location_task");
  const { startTracking } = await import("./tracking"); // dynamic to avoid circular dep
  await startTracking();
}
```

Defensive-only — catches OEM task kills between health check intervals (Fix E runs every 15 min).

---

## File Change Summary

All paths relative to `apps/van-tracker/`.

| File | Fixes | Changes |
|---|---|---|
| `src/storage/diag-log.ts` | Pre-req | +3 event types to `EventType` |
| `src/location/task.ts` | A, B, C, D, F, G | NetInfo listener, flush-on-fail, backoff cap, chunked flush, notification, GPS restart |
| `src/storage/buffer.ts` | D | `MAX_BUFFER_SIZE = 500` |
| `src/location/tracking.ts` | A, E | Teardown call, health check register/unregister |
| `src/location/health-check-task.ts` | E | **NEW** — background fetch health check |
| `app/_layout.tsx` | E | +1 import line |
| `package.json` | E | +`expo-background-fetch` |

### New Imports Summary

| File | Import | Fix |
|---|---|---|
| `task.ts` | `import * as Notifications from "expo-notifications"` | F |
| `task.ts` | `import * as Location from "expo-location"` | G |
| `tracking.ts` | extend from `"./task"` with `teardownNetInfoListener` | A |
| `tracking.ts` | `import { registerHealthCheck, unregisterHealthCheck } from "./health-check-task"` | E |
| `_layout.tsx` | `import "@/location/health-check-task"` | E |

---

## Verification

### Type-check + Lint

```sh
cd apps/van-tracker && npm run check
```

### Manual Device Test (Phase 1)

1. Start tracking on dev device
2. Enable airplane mode for 2 min (watch `consecutiveFailures` in diag log)
3. Disable airplane mode
4. **Expected:** Buffer flushes within seconds, backoff resets, `buffer_size` drops to 0

### Production Monitoring

```sql
SELECT v.name, COUNT(*) as high_buffer_pings
FROM van_location_pings vlp
JOIN vans v ON v.id = vlp.van_id
WHERE vlp.device_ts > NOW() - INTERVAL '10 minutes'
AND vlp.buffer_size >= 100
GROUP BY v.name
HAVING COUNT(*) >= 5;
```

After deploy, no van should show sustained `buffer_size >= 100`.

### Build Validation (Phase 2)

Fix E adds a native dependency — requires `npx expo prebuild` + new EAS build.
