# Tracker Network Resilience — Root Cause Analysis & Fix Plan

**Date:** 2026-03-16
**Trigger:** Van 04 stuck on map — device sent 2,104 pings but `buffer_size=100` all day; Van 02 (same phone model) healthy with `buffer_size=0`.

---

## 1. Observed Behavior

### Van 04 (broken)
- GPS collection working: 2,104 pings generated (more than Van 02)
- `buffer_size = 100` on every ping since 06:46 — device never achieved sustained real-time delivery
- Pings arrived in occasional bursts when HTTP briefly succeeded, then silence again
- Last ping at 10:49 Bahia; 12+ minutes of total silence after
- `failure_count = 0` (misleading — this only tracks consecutive failures within a single task callback, not across callbacks)

### Van 02 (healthy)
- 890 pings, all with `buffer_size = 0`
- Sporadic gaps (up to 24 min) but always recovers
- Real-time delivery throughout the day

### Same phone model, same app version, both on cellular.

---

## 2. Root Cause: Three Compounding Gaps

### Gap 1 — No active network recovery (primary)

**File:** `src/location/task.ts`, lines 328-336

```typescript
const netState = await NetInfo.fetch();
logNetworkState(netState.isConnected ?? false);
if (!netState.isConnected) {
  logBuffered();
  await addToBuffer(point);
  await persistError("No network — point buffered");
  return;
}
```

The app calls `NetInfo.fetch()` **only inside the task callback** — a poll, not a subscription. There is no `NetInfo.addEventListener()` anywhere in the codebase. When the device regains connectivity, nothing happens until the next GPS callback fires AND the backoff timer has expired.

**Impact:** If the device is in a 5-minute backoff and cellular reconnects at minute 1, it wastes 4 minutes of good connectivity. During those 4 minutes, GPS callbacks fire, check `backoffUntil > now`, and buffer the point without even trying the network.

### Gap 2 — Buffer flush gated on real-time success

**File:** `src/location/task.ts`, lines 352-374

```typescript
const result = await sendLocationPing(settings, deviceId, point);

if (result.success) {
  // ... update throttle state ...
  const flushed = await flushBuffer(settings, deviceId);
  // ...
}
```

`flushBuffer()` is only called at line 371, inside the `if (result.success)` branch. If the real-time ping fails (5xx, network error, timeout), the buffer never gets a flush attempt — even if the failure is transient and a batch request might succeed.

**Impact:** With Van 04, real-time pings kept failing → backoff escalated → buffer never flushed → buffer stayed at 100 → oldest points dropped on every new GPS fix.

### Gap 3 — Backoff doesn't reset on connectivity change

**File:** `src/location/task.ts`, lines 91-95 and 318-326

```typescript
async function onSendFailure(): Promise<void> {
  consecutiveFailures++;
  const delay = computeBackoffDelay(consecutiveFailures);
  backoffUntil = Date.now() + delay;
  await persistBackoffState();
}
```

```typescript
if (backoffUntil > 0 && now < backoffUntil) {
  logBuffered();
  await addToBuffer(point);
  return;
}
```

Once `consecutiveFailures` hits 6+, every failure sets a 5-minute `backoffUntil`. The backoff state is persisted to AsyncStorage and restored on cold start (lines 247-248). Nothing ever resets it except a successful send (lines 82-84). A network state change from offline→online doesn't reset backoff.

**Impact:** Device stuck in 5-minute retry loops even after cellular fully recovers. Combined with Gap 2, the device attempts one ping every 5 minutes, fails, escalates backoff back to 5 minutes — a self-reinforcing failure loop.

---

## 3. Reproduction Scenario

1. App starts, cellular is spotty → first few pings fail
2. `consecutiveFailures` escalates: 1→2→3→4→5→6 (backoff: 5s→10s→30s→1m→2m→5m)
3. At failure 6+, every attempt waits 5 min
4. During 5-min wait, GPS callbacks fire every 5s → all buffered (line 321)
5. Buffer fills to 100 in ~8 min (100 points × 5s), then oldest points dropped (buffer.ts line 46-48)
6. After 5 min, one retry attempt → if it fails (even transiently), backoff resets to 5 min again
7. Occasionally a retry succeeds → buffer flushes (burst visible in DB) → backoff resets
8. But next failure immediately re-enters the 5-min escalation
9. Eventually, if connectivity is bad enough or Android kills the task, pings stop entirely

---

## 4. Proposed Fixes

### Fix A — NetInfo subscription to reset backoff on reconnect

**Priority:** P0 (addresses the primary gap)

**What:** Subscribe to `NetInfo.addEventListener()` at module level in `task.ts`. When connectivity transitions from disconnected→connected, reset backoff state and attempt an immediate buffer flush.

**Where to add:** `src/location/task.ts`, new module-level code after line 47

**Implementation sketch:**

```typescript
// --- Module-level network recovery (after line 47) ---

let netInfoUnsubscribe: (() => void) | null = null;
let lastKnownConnected: boolean | null = null;

function setupNetInfoListener(): void {
  if (netInfoUnsubscribe) return; // already subscribed
  netInfoUnsubscribe = NetInfo.addEventListener(async (state) => {
    const connected = state.isConnected ?? false;
    const wasDisconnected = lastKnownConnected === false;
    lastKnownConnected = connected;

    if (connected && wasDisconnected && consecutiveFailures > 0) {
      // Network recovered while in backoff — reset and try flushing
      consecutiveFailures = 0;
      backoffUntil = 0;
      await persistBackoffState();
      logEvent("net_recovery", "backoff_reset");

      // Attempt immediate buffer flush
      try {
        const settings = await getSettings();
        const deviceId = await getOrCreateDeviceId();
        if (settings && !isFlushing && !authPaused) {
          await flushBuffer(settings, deviceId);
        }
      } catch {
        // Non-fatal — next task callback will retry
      }
    }
  });
}
```

**Call site:** Invoke `setupNetInfoListener()` at the end of the cold-start hydration block (after line 254):

```typescript
    logEvent("cold_start");
    setupNetInfoListener(); // <-- add here
  }
```

**Changes required:**
- `task.ts`: Add listener setup (~25 lines), call in cold-start block (1 line)
- `diag-log.ts`: Optional — modify `logNetworkState()` to return the previous `lastNetworkState` value (currently returns `void` at line 124) — useful for diagnostics but not required since Fix A tracks its own `lastKnownConnected`

**Edge cases:**
- Listener fires during an active send → `isFlushing` guard (line 113) prevents concurrent flushes
- Listener fires during backoff check in task callback → harmless race; worst case is a redundant flush
- Process restart → `netInfoUnsubscribe` is null, listener re-created on next cold-start
- `NetInfo.addEventListener` fires on initial subscription with current state → `lastKnownConnected === null` on first call, so `wasDisconnected` is false — no spurious flush

---

### Fix B — Attempt buffer flush even when real-time ping fails

**Priority:** P0 (addresses Gap 2)

**What:** After a 5xx or 429 failure on the real-time ping, still attempt a buffer flush. The batch endpoint has its own rate limit bucket and may succeed even when the single-ping endpoint is struggling.

**Where to change:** `src/location/task.ts`, lines 375-404 (error handling branches)

**Current flow:**
```
real-time ping succeeds → flush buffer → reset backoff
real-time ping fails    → buffer point → escalate backoff → NO flush
```

**Proposed flow:**
```
real-time ping succeeds → flush buffer → reset backoff
real-time ping fails (5xx/429) → buffer point → escalate backoff → attempt flush
real-time ping fails (network) → buffer point → escalate backoff → skip flush
```

**Implementation:** Add flush attempt after the existing error handling in each branch.

After line 383 (end of 429 branch):
```typescript
        // Still attempt buffer flush — batch endpoint has separate rate limit
        if (!isFlushing) {
          try { await flushBuffer(settings, deviceId); } catch { /* non-fatal */ }
        }
```

After line 403 (end of 5xx branch):
```typescript
        if (!isFlushing) {
          try { await flushBuffer(settings, deviceId); } catch { /* non-fatal */ }
        }
```

**Do NOT add** in the NetworkError catch (lines 406-412) — if the network is truly down, the batch will also fail.

**Risk:** One extra HTTP request on transient failures. Acceptable because:
- The batch endpoint is idempotent (dedup on `van_id, device_ts`)
- This only fires when the device is already struggling
- `isFlushing` guard prevents pile-up

---

### Fix C — Cap maximum backoff at 60 seconds

**Priority:** P1

**What:** Reduce the maximum backoff delay from 300s (5 min) to 60s (1 min).

**Where:** `src/location/task.ts`, line 54

**Current:**
```typescript
const BACKOFF_DELAYS = [5000, 10000, 30000, 60000, 120000, 300000]; // 5s→5min
```

**Proposed:**
```typescript
const BACKOFF_DELAYS = [5000, 10000, 20000, 30000, 45000, 60000]; // 5s→60s
```

**Rationale:** 5 minutes is too long for a mobile tracker on a moving van. At 5s GPS intervals, 300s backoff = 60 GPS points buffered without any delivery attempt. With a 100-point buffer, data loss starts at the 8-minute mark. At 60s max backoff, the device tries every minute — 12 points buffered per attempt, much less data loss.

**Trade-off:** More frequent retries when the server is genuinely down. But:
- Server-side rate limit (40 req/60s per van) protects against load
- One extra request per minute per van is negligible
- The tracker already stops retrying if auth fails (authPaused after 3x 401)

---

### Fix D — Increase buffer capacity from 100 to 500

**Priority:** P2

**What:** Raise `MAX_BUFFER_SIZE` to hold more points during prolonged outages.

**Where:** `src/storage/buffer.ts`, line 5

**Current:**
```typescript
const MAX_BUFFER_SIZE = 100;
```

**Proposed:**
```typescript
const MAX_BUFFER_SIZE = 500;
```

**Rationale:** 100 points at 5s intervals = 8 min of data. With Fix C (60s max backoff), overflow is less likely but still possible during multi-minute outages. 500 points = ~42 min of data, surviving most real-world connectivity gaps.

**Required change in flush logic:** The batch endpoint accepts max 100 points per request. `flushBuffer()` currently sends all points in one request (line 134). With buffer >100, needs chunked sends:

```typescript
// In flushBuffer(), replace lines 131-138 with:
const CHUNK_SIZE = 100;
let totalSent = 0;
for (let i = 0; i < validPoints.length; i += CHUNK_SIZE) {
  const chunk = validPoints.slice(i, i + CHUNK_SIZE);
  const result = await sendBatchPing(settings, deviceId, chunk);
  if (!result.success) {
    // Partial flush — remove only what was sent so far
    if (totalSent > 0) await removeFromBuffer(totalSent);
    if (result.status === 429) {
      await onSendFailure();
    }
    return true; // flush ran, partial success
  }
  totalSent += chunk.length;
}
await removeFromBuffer(totalSent);
await onSendSuccess();
```

**Alternative:** Keep buffer at 100, rely on Fixes A+B+C to prevent the situation. Simpler, no chunking needed. Revisit if monitoring shows overflow still happening.

---

## 5. Implementation Priority

| Fix | Effort | Impact | Priority |
|-----|--------|--------|----------|
| **A — NetInfo listener** | ~25 lines in task.ts | Eliminates primary failure mode (stale backoff after reconnect) | **P0** |
| **B — Flush on failure** | ~10 lines in task.ts | Unblocks buffer drain when real-time fails but batch might work | **P0** |
| **C — Cap backoff at 60s** | 1 line change | Reduces worst-case silence from 5 min to 1 min | **P1** |
| **D — Larger buffer** | 1 line + chunking (~20 lines) | Prevents data loss during long outages | **P2** |

**Recommended:** Ship A + B + C together. They're complementary, small, and independently testable. D can follow if monitoring shows it's needed.

---

## 6. Testing Strategy

### Unit tests (Vitest)

**Fix A:**
- Mock `NetInfo.addEventListener`. Simulate offline→online transition with `consecutiveFailures = 5`. Assert: backoff reset to 0, `flushBuffer` called, `logEvent("net_recovery")` emitted.
- Simulate online→online (no change). Assert: no backoff reset, no flush.
- Simulate offline→online with `authPaused = true`. Assert: flush NOT called (auth gate respected).

**Fix B:**
- Mock `sendLocationPing` returning `{ success: false, status: 500 }`. Assert `flushBuffer` is called.
- Mock `sendLocationPing` throwing `NetworkError`. Assert `flushBuffer` is NOT called.

**Fix C:**
- Assert `computeBackoffDelay(10)` returns `60000`, not `300000`.
- Assert `computeBackoffDelay(1)` still returns `5000` (low end unchanged).

### Manual validation (dev device)

1. Start tracking on dev device
2. Enable airplane mode for 2 minutes (watch `consecutiveFailures` in diag log)
3. Disable airplane mode
4. **Before fix:** Buffer stays at 100, backoff timer visible in diagnostics, no flush until timer expires
5. **After fix:** Buffer flushes within seconds of reconnect, backoff resets, `buffer_size` drops to 0 on next ping

### Production validation

Monitor `buffer_size` on incoming pings:

```sql
-- Vans with buffer_size=100 on their last 5 pings (connectivity problem)
SELECT v.name, COUNT(*) as high_buffer_pings
FROM van_location_pings vlp
JOIN vans v ON v.id = vlp.van_id
WHERE vlp.device_ts > NOW() - INTERVAL '10 minutes'
AND vlp.buffer_size >= 100
GROUP BY v.name
HAVING COUNT(*) >= 5;
```

After deploying, Van 04's `buffer_size` should stay near 0 (matching Van 02). If any van shows sustained `buffer_size >= 100`, the fix didn't fully resolve the connectivity issue for that device.

---

## 7. Files to Modify

| File | Changes |
|------|---------|
| `apps/van-tracker/src/location/task.ts` | Add NetInfo listener (Fix A, ~25 lines), flush-on-failure (Fix B, ~10 lines), update `BACKOFF_DELAYS` (Fix C, 1 line) |
| `apps/van-tracker/src/storage/buffer.ts` | Optionally increase `MAX_BUFFER_SIZE` (Fix D, 1 line) |
| `apps/van-tracker/src/storage/diag-log.ts` | Optional: modify `logNetworkState()` to return previous state (Fix A diagnostic enrichment) |

No server-side changes required. No new dependencies.

---

## 8. Autonomous Recovery — What the App Already Has vs What's Missing

### Already implemented

| Mechanism | File | What it does |
|-----------|------|--------------|
| **Boot restart** | `plugins/withBootRestart.js` | Native `BootRestartReceiver` listens for `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED` intents. Auto-launches app if tracking was enabled. 60s boot-loop guard. |
| **Device-protected storage** | `src/storage/device-protected-state.ts` | `tracking_enabled` flag survives factory reset (Android 7+ encrypted storage). Boot receiver reads this before app JS loads. |
| **Foreground service** | `src/location/tracking.ts:73-85` | `killServiceOnDestroy: false` — Android keeps location service alive even if user swipes app from recents. |
| **Battery auto-degradation** | `src/location/tracking.ts:108-122` | Battery listener switches from High (5s) to Balanced (10s) accuracy at <20%, back at >25%. Non-blocking. |
| **Task-kill detection** | `app/index.tsx:65-81` | On app resume, checks if last task callback was >5 min ago. Shows "Tracking May Have Stopped" modal. |
| **Cold-start hydration** | `src/location/task.ts:215-255` | Restores full module state (coords, backoff, auth) from AsyncStorage on first callback after process restart. |
| **Geofence cache recovery** | `src/location/tracking.ts:170-184` | Re-registers geofences from cached regions without network. 15s boot grace period suppresses replayed events. |
| **Config version resync** | `src/api/client.ts:107-122` | Server response includes `configVersion`; mismatch triggers async geofence re-fetch. |

### What's missing — additional autonomous fixes

#### Fix E — `expo-background-fetch` periodic health check

**Priority:** P1

**What:** Install `expo-background-fetch` and register a periodic task (~15 min interval, Android minimum) that checks tracking health and triggers recovery independently of GPS callbacks.

**Why:** The current architecture depends entirely on the GPS callback chain. If Android kills the foreground service (aggressive OEMs like Samsung, Xiaomi) AND the location task stops firing, there's no other mechanism to detect the problem or restart. `expo-background-fetch` uses Android's `JobScheduler` under the hood, which is more resilient to process kills than foreground location services.

**Where:** New file `src/location/health-check-task.ts`

**Implementation sketch:**

```typescript
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { logEvent } from "@/storage/diag-log";

const HEALTH_CHECK_TASK = "health-check-task";

TaskManager.defineTask(HEALTH_CHECK_TASK, async () => {
  const enabled = await getTrackingEnabled();
  if (!enabled) return BackgroundFetch.BackgroundFetchResult.NoData;

  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    "background-location-task",
  );

  if (!isTracking) {
    // Location task was killed — restart it
    logEvent("health_recovery", "location_task_restarted");
    const { startTracking } = await import("@/location/tracking");
    await startTracking();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  }

  // Check last task invocation freshness
  const lastInvocation = await AsyncStorage.getItem("@lastTaskInvocationAt");
  if (lastInvocation && Date.now() - Number(lastInvocation) > 10 * 60 * 1000) {
    // Task callback hasn't fired in 10 min — restart location updates
    logEvent("health_recovery", "stale_task_restarted");
    await Location.stopLocationUpdatesAsync("background-location-task");
    const { startTracking } = await import("@/location/tracking");
    await startTracking();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  }

  return BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function registerHealthCheck(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(HEALTH_CHECK_TASK, {
    minimumInterval: 15 * 60, // 15 min (Android minimum)
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
```

**Setup:** Add `expo-background-fetch` to package.json, call `registerHealthCheck()` from `startTracking()`.

**Limitations:**
- Android enforces minimum 15-minute intervals for `JobScheduler`
- Won't fire if device is in Doze mode without high-priority FCM wake
- But it's strictly better than nothing — catches the "task silently died" case

---

#### Fix F — Local notification on prolonged failure

**Priority:** P2

**What:** Use the already-installed `expo-notifications` to fire a local notification when the tracker detects prolonged delivery failure, prompting the driver to open the app.

**Why:** The current task-kill modal only shows when the user opens the app. If the driver doesn't open the app for hours, they never know tracking is broken. A notification is the only way to reach them while the app is backgrounded.

**Where:** `src/location/task.ts`, inside the backoff check

**Implementation sketch:**

```typescript
import * as Notifications from "expo-notifications";

const FAILURE_NOTIFICATION_THRESHOLD = 10; // 10 consecutive failures
let failureNotificationSent = false;

// Inside the backoff check (around line 319), add:
if (consecutiveFailures >= FAILURE_NOTIFICATION_THRESHOLD && !failureNotificationSent) {
  failureNotificationSent = true;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "CAAB Tracker",
      body: "Rastreamento com problemas de conexão. Toque para verificar.",
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: null, // immediate
  });
  logEvent("failure_notification_sent");
}

// In onSendSuccess(), reset the flag:
failureNotificationSent = false;
```

**Trade-off:** Notifications can be annoying. Use a high threshold (10+ failures = ~1 min of failed attempts with Fix C) and only fire once per failure episode. Reset on success.

---

#### Fix G — Network-aware GPS restart

**Priority:** P3 (defensive, for edge cases)

**What:** When the NetInfo listener (Fix A) detects reconnection, also verify the location task is still running and restart it if not.

**Why:** On some Android OEMs (Samsung, Xiaomi, Huawei), aggressive battery management can kill the foreground service AND the location task without triggering a reboot. The boot receiver doesn't fire. The health check (Fix E) runs at 15-min intervals. This plugs the gap between reconnection and the next health check.

**Where:** Inside the `setupNetInfoListener()` function from Fix A

**Addition to Fix A sketch:**

```typescript
// Inside the reconnection handler, after flushing buffer:
try {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (!isTracking) {
    logEvent("net_recovery", "location_task_restarted");
    const { startTracking } = await import("@/location/tracking");
    await startTracking();
  }
} catch {
  // Non-fatal
}
```

**Risk:** `startTracking()` requests permissions again. On Android, if permissions were previously granted, this is a no-op. But if the user revoked location permission while offline, this will silently fail (permission prompts don't fire from background). The health check (Fix E) is a more reliable fallback for this case since it runs in a different scheduling context.

---

### What the app CANNOT do autonomously (platform limits)

| Limitation | Why | Workaround |
|------------|-----|------------|
| **Toggle airplane mode / cellular** | Android doesn't allow apps to control radios since API 21 (Android 5) | None — requires user action |
| **Reset network stack** | Requires `CONNECTIVITY_INTERNAL` (system-only permission) | None — airplane mode toggle is the only user workaround |
| **Force GPS cold restart** | No API to reset GPS chipset from userspace | `Location.stopLocationUpdatesAsync()` + `startLocationUpdatesAsync()` can force re-acquisition but won't fix hardware issues |
| **Override battery optimization** | Can request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` but can't force it | Already using foreground service; can add Intent to guide user to battery settings |
| **Wake from Doze mode** | Only high-priority FCM push can break Doze | Would need server-side push notification when van goes silent — heavy infrastructure change |
| **Prevent OEM task kill** | Samsung/Xiaomi custom battery managers ignore standard Android APIs | Boot receiver + health check are the best mitigation; can add autostart permission request (OEM-specific) |
| **Run code below 15-min interval in background** | Android JobScheduler minimum is 15 min | Foreground service (already used) is the only way to run more frequently |

---

## 9. Updated Implementation Priority (all fixes)

| Fix | Effort | Impact | Priority |
|-----|--------|--------|----------|
| **A — NetInfo listener** | ~25 lines in task.ts | Eliminates primary failure mode | **P0** |
| **B — Flush on failure** | ~10 lines in task.ts | Unblocks buffer drain | **P0** |
| **C — Cap backoff at 60s** | 1 line | Reduces worst-case silence | **P1** |
| **E — Background health check** | New file + dependency | Catches silent task death | **P1** |
| **F — Local failure notification** | ~15 lines in task.ts | Alerts driver to act | **P2** |
| **D — Larger buffer** | 1 line + chunking | Prevents data loss | **P2** |
| **G — GPS restart on reconnect** | ~10 lines in Fix A | Defensive restart | **P3** |

**Recommended rollout:**
- **Phase 1:** A + B + C (network resilience core — small, ship together)
- **Phase 2:** E + F (autonomous recovery — requires `expo-background-fetch` install and new build)
- **Phase 3:** D + G (hardening — only if monitoring shows remaining issues)