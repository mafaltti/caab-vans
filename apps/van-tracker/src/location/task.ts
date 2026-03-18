import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSettings } from "@/storage/settings";
import { getOrCreateDeviceId } from "@/storage/device-id";
import { getLastSentAt, setLastSentAt } from "@/storage/tracking-state";
import { sendLocationPing, sendBatchPing, NetworkError } from "@/api/client";
import {
  getBuffer,
  getBufferSize,
  addToBuffer,
  removeFromBuffer,
  filterExpiredPoints,
} from "@/storage/buffer";
import { haversineDistance } from "@/lib/haversine";
import {
  logCallback,
  logEvent,
  logFiltered,
  logThrottled,
  logNetworkState,
  logBuffered,
  logOk,
  logFail,
  flushLog,
} from "@/storage/diag-log";
import type { LocationPoint } from "@/types";

export const BACKGROUND_LOCATION_TASK = "background-location-task";

// Throttle state (module-level — persists across task invocations)
let lastSentLat: number | null = null;
let lastSentLng: number | null = null;
let lastSentTime = 0;
let lastSentTs = 0;

// Backoff state (US2)
let consecutiveFailures = 0;
let backoffUntil = 0;

// Flush guard — in-memory only, resets on process restart (FR-001/FR-003)
let isFlushing = false;

// Auth failure state (US2)
let consecutive401s = 0;
let authPaused = false;

// Network recovery listener state (US1)
let netInfoUnsubscribe: (() => void) | null = null;
let lastKnownConnected: boolean | null = null;

// Failure notification state (US4)
const FAILURE_NOTIFICATION_THRESHOLD = 10;
let failureNotificationSent = false;

// Runtime readiness flag (R2)
let runtimeReady = false;

const ACCURACY_THRESHOLD = 50; // meters
const MIN_DISTANCE = 5; // meters
const MIN_INTERVAL = 3000; // milliseconds
const STATIONARY_MAX_INTERVAL = 20_000; // 3 pings/min when stationary

const BACKOFF_DELAYS = [5000, 10000, 20000, 30000, 45000, 60000]; // 5s→60s

async function persistError(message: string | null): Promise<void> {
  if (message) {
    await AsyncStorage.setItem("@lastError", message);
  } else {
    await AsyncStorage.removeItem("@lastError");
  }
}

async function persistCoords(lat: number, lng: number): Promise<void> {
  await AsyncStorage.setItem("@lastLat", String(lat));
  await AsyncStorage.setItem("@lastLng", String(lng));
}

async function persistBackoffState(): Promise<void> {
  await AsyncStorage.setItem(
    "@consecutiveFailures",
    String(consecutiveFailures),
  );
  await AsyncStorage.setItem("@backoffUntil", String(backoffUntil));
}

function computeBackoffDelay(failures: number): number {
  const idx = Math.min(failures - 1, BACKOFF_DELAYS.length - 1);
  return BACKOFF_DELAYS[Math.max(0, idx)];
}

async function onSendSuccess(): Promise<void> {
  consecutiveFailures = 0;
  backoffUntil = 0;
  consecutive401s = 0;
  authPaused = false;
  failureNotificationSent = false;
  await persistBackoffState();
  await AsyncStorage.removeItem("@authPaused");
}

async function onSendFailure(): Promise<void> {
  consecutiveFailures++;
  const delay = computeBackoffDelay(consecutiveFailures);
  backoffUntil = Date.now() + delay;
  await persistBackoffState();
}

async function on401Failure(): Promise<void> {
  consecutive401s++;
  if (consecutive401s >= 3 && !authPaused) {
    authPaused = true;
    await AsyncStorage.setItem("@authPaused", "true");
    await persistError("Auth failed — check token in Settings");
  }
}

// US1: NetInfo listener — detect offline→online and trigger recovery
function setupNetInfoListener(): void {
  if (netInfoUnsubscribe) return; // already subscribed
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const connected = state.isConnected ?? false;
    // First invocation — just record initial state, don't trigger flush
    if (lastKnownConnected === null) {
      lastKnownConnected = connected;
      return;
    }
    // Only act on offline→online transitions
    if (lastKnownConnected === false && connected === true) {
      consecutiveFailures = 0;
      backoffUntil = 0;
      logEvent("net_recovery", "start:net_recovery");
      // Async recovery in fire-and-forget IIFE (listener expects sync callback)
      (async () => {
        try {
          await persistBackoffState();
          if (!authPaused && !isFlushing) {
            const settings = await getSettings();
            if (settings) {
              const deviceId = await getOrCreateDeviceId();
              await flushBuffer(settings, deviceId);
            }
          }
          // Check if location task was killed by OS and restart
          const isRunning =
            await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          if (!isRunning) {
            const { startTracking } = await import("./tracking");
            await startTracking({ interactive: false, source: "net_recovery" });
          }
          logEvent("net_recovery", "ok:net_recovery");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          logEvent("net_recovery", msg.startsWith("skip:") ? msg : "fail:" + msg);
          try { await flushLog(); } catch { /* non-fatal */ }
        }
      })();
    }
    lastKnownConnected = connected;
  });
}

export function teardownNetInfoListener(): void {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  lastKnownConnected = null;
}

export async function ensureTrackingRuntimeReady(): Promise<void> {
  if (runtimeReady) return;
  const [
    storedLat,
    storedLng,
    storedTime,
    storedTs,
    storedFailures,
    storedBackoff,
    storedAuthPaused,
  ] = await Promise.all([
    AsyncStorage.getItem("@lastLat"),
    AsyncStorage.getItem("@lastLng"),
    getLastSentAt(),
    AsyncStorage.getItem("@lastSentTs"),
    AsyncStorage.getItem("@consecutiveFailures"),
    AsyncStorage.getItem("@backoffUntil"),
    AsyncStorage.getItem("@authPaused"),
  ]);
  if (storedLat !== null && storedLng !== null) {
    lastSentLat = Number(storedLat);
    lastSentLng = Number(storedLng);
  }
  if (storedTime !== null) {
    lastSentTime = storedTime;
  }
  if (storedTs !== null) {
    lastSentTs = Number(storedTs);
  }
  if (storedFailures !== null) {
    consecutiveFailures = Number(storedFailures);
  }
  if (storedBackoff !== null) {
    backoffUntil = Number(storedBackoff);
  }
  if (storedAuthPaused === "true") {
    authPaused = true;
    consecutive401s = 3;
  }
  setupNetInfoListener();
  runtimeReady = true;
}

export async function clearTransientRecoveryState(): Promise<void> {
  consecutiveFailures = 0;
  backoffUntil = 0;
  consecutive401s = 0;
  authPaused = false;
  failureNotificationSent = false;
  await Promise.all([
    AsyncStorage.removeItem("@consecutiveFailures"),
    AsyncStorage.removeItem("@backoffUntil"),
    AsyncStorage.removeItem("@authPaused"),
    AsyncStorage.removeItem("@lastError"),
  ]);
}

export async function resetRuntimeForStop(): Promise<void> {
  await clearTransientRecoveryState();
  teardownNetInfoListener();
  lastSentLat = null;
  lastSentLng = null;
  lastSentTime = 0;
  lastSentTs = 0;
  runtimeReady = false;
  await Promise.all([
    AsyncStorage.removeItem("@lastLat"),
    AsyncStorage.removeItem("@lastLng"),
    AsyncStorage.removeItem("@lastSentTs"),
    AsyncStorage.removeItem("@lastSentAt"),
  ]);
}

// US4: Alert driver after prolonged delivery failure
async function sendFailureNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "CAAB Tracker",
        body: "Rastreamento com problemas de conexão. Toque para verificar.",
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
    failureNotificationSent = true;
    logEvent("failure_notification_sent");
  } catch {
    // Non-fatal — notification failure shouldn't affect tracking
  }
}

// Returns true if flush actually ran, false if skipped due to concurrency
async function flushBuffer(
  settings: NonNullable<Awaited<ReturnType<typeof getSettings>>>,
  deviceId: string,
): Promise<boolean> {
  // FR-001/FR-002: Skip if another flush is already in progress
  if (isFlushing) return false;
  isFlushing = true;

  try {
    const buffer = await getBuffer();
    if (buffer.length === 0) return true;

    // TTL filter — discard points older than 24h
    const validPoints = filterExpiredPoints(buffer);
    const expired = buffer.length - validPoints.length;

    if (expired > 0) {
      // Remove expired points from buffer
      await removeFromBuffer(expired);
    }

    if (validPoints.length === 0) return true;

    // US5: Chunked flush — send in batches of 100 to respect server limit
    const CHUNK_SIZE = 100;
    let totalSent = 0;
    logEvent("flush", "start n=" + validPoints.length);

    for (let i = 0; i < validPoints.length; i += CHUNK_SIZE) {
      const chunk = validPoints.slice(i, i + CHUNK_SIZE);
      try {
        const result = await sendBatchPing(settings, deviceId, chunk);
        if (result.success) {
          totalSent += chunk.length;
        } else if (result.status === 429) {
          await onSendFailure();
          const delay = computeBackoffDelay(consecutiveFailures);
          logEvent("flush", `rate_limited backoff=${Math.ceil(delay / 1000)}s`);
          await persistError("Rate limited — buffered points retained");
          break;
        } else if (result.status === 401) {
          await on401Failure();
          break;
        } else if (result.status && result.status >= 400 && result.status < 500) {
          // Client error — drop this chunk, retries won't help
          totalSent += chunk.length;
        } else {
          // Server error — stop sending, keep remaining in buffer
          await onSendFailure();
          break;
        }
      } catch {
        // Network error — stop sending, keep remaining in buffer
        await onSendFailure();
        break;
      }
    }

    if (totalSent > 0) {
      await removeFromBuffer(totalSent);
      logEvent("flush", "done sent=" + totalSent);
    }
    return true;
  } finally {
    isFlushing = false;
  }
}

async function getNetworkType(): Promise<string | null> {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return "none";
    if (state.type === "wifi") return "wifi";
    if (state.type === "cellular") return "cellular";
    return "none";
  } catch {
    return null;
  }
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  logCallback();
  if (error) {
    logEvent("task_error", error.message);
    console.error("[CAAB Tracker] Task error:", error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as {
    locations: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        heading: number | null;
      };
      timestamp: number;
    }[];
  };

  if (!locations || locations.length === 0) return;

  // US3: Store last task invocation timestamp for kill detection
  await AsyncStorage.setItem("@lastTaskInvocationAt", String(Date.now()));

  const latest = locations[locations.length - 1];
  const point: LocationPoint = {
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
    accuracy: latest.coords.accuracy,
    speed: latest.coords.speed,
    heading: latest.coords.heading,
    ts: latest.timestamp,
  };

  // Cold-start hydration — restore state from AsyncStorage on first callback
  if (!runtimeReady) {
    await ensureTrackingRuntimeReady();
    logEvent("cold_start");
  }

  // Accuracy filter — drop inaccurate points
  if (point.accuracy !== null && point.accuracy > ACCURACY_THRESHOLD) {
    logFiltered("acc");
    return;
  }

  // Duplicate GPS timestamp guard — Android returns cached fixes with same ts
  if (point.ts > 0 && point.ts === lastSentTs) {
    logFiltered("dup");
    return;
  }

  // Stale fix guard — gap-based relaxation
  // speed === null is treated as stationary: Android often returns null speed on
  // cold start while parked (the exact scenario that caused the original bug).
  // Excluding null would re-break the fix for those devices. Risk of a moving
  // van with null speed + stale fix is low and self-corrects on the next callback.
  // See research decision R2 in specs/043-fix-stale-gps-guard/research.md.
  const isColdGap = (Date.now() - lastSentTime) > 120_000;
  const isStationary = point.speed === null || point.speed <= 1;
  // During cold gaps, relax the stale threshold to 5 min to allow doze recovery
  // without accepting arbitrarily old cached fixes that could rewind the marker.
  const staleThreshold = isColdGap ? 300_000 : (isStationary ? 120_000 : 60_000);
  if (Date.now() - point.ts > staleThreshold) {
    logFiltered("stale");
    return;
  }

  // Throttle — skip if too close and too soon
  const now = Date.now();
  if (lastSentLat !== null && lastSentLng !== null) {
    const distance = haversineDistance(
      lastSentLat,
      lastSentLng,
      point.lat,
      point.lng,
    );
    const elapsed = now - lastSentTime;
    if (distance === 0 && elapsed < STATIONARY_MAX_INTERVAL) {
      logThrottled();
      return;
    }
    if (distance < MIN_DISTANCE && elapsed < MIN_INTERVAL) {
      logThrottled();
      return;
    }
  }

  try {
    const settings = await getSettings();
    if (!settings) return;

    const deviceId = await getOrCreateDeviceId();

    // US2: Check auth pause — buffer point, don't send
    if (authPaused) {
      logBuffered();
      await addToBuffer(point);
      return;
    }

    // US2: Backoff check — if in backoff period, buffer current point
    if (backoffUntil > 0 && now < backoffUntil) {
      logBuffered();
      await addToBuffer(point);
      // US4: Notify driver after prolonged consecutive failures
      if (consecutiveFailures >= FAILURE_NOTIFICATION_THRESHOLD && !failureNotificationSent) {
        await sendFailureNotification();
      }
      await persistError(
        `Backing off — retry in ${Math.ceil((backoffUntil - now) / 1000)}s`,
      );
      return;
    }

    // Check connectivity before attempting sends
    const netState = await NetInfo.fetch();
    logNetworkState(netState.isConnected ?? false);
    if (!netState.isConnected) {
      logBuffered();
      await addToBuffer(point);
      await persistError("No network — point buffered");
      return;
    }

    // US4: Enrich point with health metadata
    const bufferSize = await getBufferSize();
    const networkType = await getNetworkType();
    let batteryLevel: number | null = null;
    try {
      batteryLevel = await Battery.getBatteryLevelAsync();
    } catch {
      // expo-battery may not be available on all devices
    }
    point.bufferSize = bufferSize;
    point.failureCount = consecutiveFailures;
    point.batteryLevel = batteryLevel;
    point.networkType = networkType;

    // US1: Send current real-time point FIRST (swap order)
    const result = await sendLocationPing(settings, deviceId, point);

    if (result.success) {
      lastSentLat = point.lat;
      lastSentLng = point.lng;
      lastSentTime = now;
      lastSentTs = point.ts;

      await setLastSentAt(now);
      await AsyncStorage.setItem("@lastSentTs", String(point.ts));
      await persistCoords(point.lat, point.lng);
      await persistError(null);
      logOk();

      // US1: Then flush buffer (batch) — only reset shared state if flush
      // actually ran and didn't escalate either failure counter
      const failuresBefore = consecutiveFailures;
      const auth401sBefore = consecutive401s;
      const flushed = await flushBuffer(settings, deviceId);
      if (flushed && consecutiveFailures <= failuresBefore && consecutive401s <= auth401sBefore) {
        await onSendSuccess();
      }
    } else {
      if (result.status === 429) {
        logBuffered();
        // Rate limited — apply backoff, buffer point (FR-004)
        await addToBuffer(point);
        await onSendFailure();
        const delay = computeBackoffDelay(consecutiveFailures);
        logEvent("error", `429: rate_limited backoff=${Math.ceil(delay / 1000)}s`);
        await persistError(`Rate limited — retry in ${Math.ceil(delay / 1000)}s`);
        // US2: Attempt batch flush — batch endpoint uses separate rate-limit bucket
        if (!isFlushing) {
          try { await flushBuffer(settings, deviceId); } catch { /* non-fatal */ }
        }
      } else if (result.status === 400) {
        logEvent("error", "400: " + (result.message ?? "validation"));
        // Validation error — log, don't buffer
        console.warn("[CAAB Tracker] Validation error:", result.message);
        await persistError(`Validation: ${result.message}`);
      } else if (result.status === 401) {
        logEvent("error", "401: " + (result.message ?? "auth"));
        // US2: 401 escalation
        await on401Failure();
        await addToBuffer(point);
        await persistError(`Auth error: ${result.message}`);
      } else if (result.status === 404) {
        logEvent("error", "404: " + (result.message ?? "not found"));
        await persistError(`${result.code}: ${result.message}`);
      } else {
        logFail();
        // US1: 5xx — buffer current point
        await addToBuffer(point);
        await onSendFailure();
        await persistError(`Server error — point buffered (retry in ${Math.ceil(computeBackoffDelay(consecutiveFailures) / 1000)}s)`);
        // US2: Attempt batch flush on 5xx — server may recover for batch requests
        if (!isFlushing) {
          try { await flushBuffer(settings, deviceId); } catch { /* non-fatal */ }
        }
      }
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      logBuffered();
      // Buffer on network error
      await addToBuffer(point);
      await onSendFailure();
      await persistError("Network error — point buffered");
    } else {
      logEvent("error", err instanceof Error ? err.message : "unexpected");
      console.error("[CAAB Tracker] Unexpected error:", err);
      await persistError(
        err instanceof Error ? err.message : "Unexpected error",
      );
    }
  }
  await flushLog();
});
