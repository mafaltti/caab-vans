import * as TaskManager from "expo-task-manager";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSettings } from "@/storage/settings";
import { getOrCreateDeviceId } from "@/storage/device-id";
import { getLastSentAt, setLastSentAt } from "@/storage/tracking-state";
import { sendLocationPing, NetworkError } from "@/api/client";
import { getBuffer, addToBuffer, removeFromBuffer } from "@/storage/buffer";
import { haversineDistance } from "@/lib/haversine";
import type { LocationPoint } from "@/types";

export const BACKGROUND_LOCATION_TASK = "background-location-task";

// Throttle state (module-level — persists across task invocations)
let lastSentLat: number | null = null;
let lastSentLng: number | null = null;
let lastSentTime = 0;
let lastSentTs = 0;

const ACCURACY_THRESHOLD = 50; // meters
const MIN_DISTANCE = 5; // meters
const MIN_INTERVAL = 3000; // milliseconds
const STATIONARY_MAX_INTERVAL = 60_000; // 1 ping/min when stationary

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

async function flushBuffer(
  settings: NonNullable<Awaited<ReturnType<typeof getSettings>>>,
  deviceId: string,
): Promise<void> {
  const buffer = await getBuffer();
  if (buffer.length === 0) return;

  let consumed = 0;
  for (const bufferedPoint of buffer) {
    try {
      const result = await sendLocationPing(settings, deviceId, bufferedPoint);
      if (result.success) {
        consumed++;
      } else if (result.status && result.status >= 400 && result.status < 500) {
        // Client error (400/401/404/429) — point is bad or rejected, drop it
        consumed++;
      } else {
        break; // Server error (5xx) — stop flushing, retry later
      }
    } catch {
      break; // Network error — stop flushing, retry later
    }
  }

  if (consumed > 0) {
    await removeFromBuffer(consumed);
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

  const latest = locations[locations.length - 1];
  const point: LocationPoint = {
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
    accuracy: latest.coords.accuracy,
    speed: latest.coords.speed,
    heading: latest.coords.heading,
    ts: latest.timestamp,
  };

  // Cold-start hydration — restore throttle state from AsyncStorage on first callback
  if (lastSentLat === null) {
    const [storedLat, storedLng, storedTime] = await Promise.all([
      AsyncStorage.getItem("@lastLat"),
      AsyncStorage.getItem("@lastLng"),
      getLastSentAt(),
    ]);
    if (storedLat !== null && storedLng !== null) {
      lastSentLat = Number(storedLat);
      lastSentLng = Number(storedLng);
    }
    if (storedTime !== null) {
      lastSentTime = storedTime;
    }
  }

  // T018: Accuracy filter — drop inaccurate points
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

  // T018: Throttle — skip if too close and too soon
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

    // T020: Check connectivity before attempting sends
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      await addToBuffer(point);
      await persistError("No network — point buffered");
      return;
    }

    // T020: Flush buffer before sending new point
    await flushBuffer(settings, deviceId);

    // Send current point
    const result = await sendLocationPing(settings, deviceId, point);

    if (result.success) {
      lastSentLat = point.lat;
      lastSentLng = point.lng;
      lastSentTime = now;
      lastSentTs = point.ts;
      await setLastSentAt(now);
      await persistCoords(point.lat, point.lng);
      await persistError(null);
    } else {
      // T022: Differentiated error handling
      if (result.status === 429) {
        // Rate limited — skip, don't buffer
        await persistError("Rate limited — skipping");
      } else if (result.status === 400) {
        // Validation error — log, don't buffer
        console.warn("[CAAB Tracker] Validation error:", result.message);
        await persistError(`Validation: ${result.message}`);
      } else if (result.status === 401 || result.status === 404) {
        // Auth/not found — display error, continue sending
        await persistError(`${result.code}: ${result.message}`);
      } else {
        await persistError(`Error: ${result.message}`);
      }
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      // T020: Buffer on network error
      await addToBuffer(point);
      await persistError("Network error — point buffered");
    } else {
      console.error("[CAAB Tracker] Unexpected error:", err);
      await persistError(
        err instanceof Error ? err.message : "Unexpected error",
      );
    }
  }
});
