import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
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

// Auth failure state (US2)
let consecutive401s = 0;
let authPaused = false;

// Sequence state (US5)
let currentSeq = 0;

const ACCURACY_THRESHOLD = 50; // meters
const MIN_DISTANCE = 5; // meters
const MIN_INTERVAL = 3000; // milliseconds
const STATIONARY_MAX_INTERVAL = 60_000; // 1 ping/min when stationary

const BACKOFF_DELAYS = [5000, 10000, 30000, 60000, 120000, 300000]; // 5s→5min

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

async function flushBuffer(
  settings: NonNullable<Awaited<ReturnType<typeof getSettings>>>,
  deviceId: string,
): Promise<void> {
  const buffer = await getBuffer();
  if (buffer.length === 0) return;

  // TTL filter — discard points older than 24h
  const validPoints = filterExpiredPoints(buffer);
  const expired = buffer.length - validPoints.length;

  if (expired > 0) {
    // Remove expired points from buffer
    await removeFromBuffer(expired);
  }

  if (validPoints.length === 0) return;

  // Batch flush — single request for all buffered points
  try {
    const result = await sendBatchPing(settings, deviceId, validPoints);
    if (result.success) {
      await removeFromBuffer(validPoints.length);
      await onSendSuccess();
    } else if (result.status && result.status >= 400 && result.status < 500) {
      // Client error — drop points
      await removeFromBuffer(validPoints.length);
      if (result.status === 401) {
        await on401Failure();
      }
    } else {
      // Server error — keep buffered, will retry later
      await onSendFailure();
    }
  } catch {
    // Network error — keep buffered, will retry later
    await onSendFailure();
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
  if (error) {
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
  if (lastSentLat === null) {
    const [
      storedLat,
      storedLng,
      storedTime,
      storedTs,
      storedFailures,
      storedBackoff,
      storedSeq,
      storedAuthPaused,
    ] = await Promise.all([
      AsyncStorage.getItem("@lastLat"),
      AsyncStorage.getItem("@lastLng"),
      getLastSentAt(),
      AsyncStorage.getItem("@lastSentTs"),
      AsyncStorage.getItem("@consecutiveFailures"),
      AsyncStorage.getItem("@backoffUntil"),
      AsyncStorage.getItem("@currentSeq"),
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
    if (storedSeq !== null) {
      currentSeq = Number(storedSeq);
    }
    if (storedAuthPaused === "true") {
      authPaused = true;
      consecutive401s = 3;
    }
  }

  // Accuracy filter — drop inaccurate points
  if (point.accuracy !== null && point.accuracy > ACCURACY_THRESHOLD) {
    return;
  }

  // Duplicate GPS timestamp guard — Android returns cached fixes with same ts
  if (point.ts > 0 && point.ts === lastSentTs) {
    return;
  }

  // Stale fix guard — reject GPS fixes older than 60 seconds
  if (Date.now() - point.ts > 60_000) {
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
      return;
    }
    if (distance < MIN_DISTANCE && elapsed < MIN_INTERVAL) {
      return;
    }
  }

  try {
    const settings = await getSettings();
    if (!settings) return;

    const deviceId = await getOrCreateDeviceId();

    // US2: Check auth pause — buffer point, don't send
    if (authPaused) {
      await addToBuffer(point);
      return;
    }

    // US2: Backoff check — if in backoff period, buffer current point
    if (backoffUntil > 0 && now < backoffUntil) {
      await addToBuffer(point);
      await persistError(
        `Backing off — retry in ${Math.ceil((backoffUntil - now) / 1000)}s`,
      );
      return;
    }

    // Check connectivity before attempting sends
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
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
    point.seq = currentSeq > 0 ? currentSeq : null;
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

      // US5: Increment sequence counter
      currentSeq++;
      await AsyncStorage.setItem("@currentSeq", String(currentSeq));

      await setLastSentAt(now);
      await AsyncStorage.setItem("@lastSentTs", String(point.ts));
      await persistCoords(point.lat, point.lng);
      await persistError(null);
      await onSendSuccess();

      // US1: Then flush buffer (batch)
      await flushBuffer(settings, deviceId);
    } else {
      if (result.status === 429) {
        // Rate limited — skip, don't buffer
        await persistError("Rate limited — skipping");
      } else if (result.status === 400) {
        // Validation error — log, don't buffer
        console.warn("[CAAB Tracker] Validation error:", result.message);
        await persistError(`Validation: ${result.message}`);
      } else if (result.status === 401) {
        // US2: 401 escalation
        await on401Failure();
        await addToBuffer(point);
        await persistError(`Auth error: ${result.message}`);
      } else if (result.status === 404) {
        await persistError(`${result.code}: ${result.message}`);
      } else {
        // US1: 5xx — buffer current point
        await addToBuffer(point);
        await onSendFailure();
        await persistError(`Server error — point buffered (retry in ${Math.ceil(computeBackoffDelay(consecutiveFailures) / 1000)}s)`);
      }
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      // Buffer on network error
      await addToBuffer(point);
      await onSendFailure();
      await persistError("Network error — point buffered");
    } else {
      console.error("[CAAB Tracker] Unexpected error:", err);
      await persistError(
        err instanceof Error ? err.message : "Unexpected error",
      );
    }
  }
});

// US5: Reset sequence counter (called on route start)
export async function resetSequence(): Promise<void> {
  currentSeq = 0;
  await AsyncStorage.setItem("@currentSeq", "0");
}
