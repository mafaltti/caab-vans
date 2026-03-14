import * as TaskManager from "expo-task-manager";
import { randomUUID } from "expo-crypto";
import {
  getGeofenceEventBuffer,
  addGeofenceEvent,
} from "@/storage/tracking-state";
import { logEvent, flushLog } from "@/storage/diag-log";

export const GEOFENCE_TASK = "geofence-task";

const DEDUP_WINDOW_MS = 60_000; // 60 seconds

// Boot grace period — suppress OS-replayed geofence events after cold start (FR-008)
const BOOT_GRACE_MS = 15_000;
const bootTimestamp = Date.now();

// In-memory dedup map — instant O(1) check before async buffer read (FR-009)
const recentEnters = new Map<string, number>();

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    logEvent("error", `geofence: ${error.message}`);
    await flushLog();
    return;
  }

  if (!data) return;

  const { eventType, region } = data as {
    eventType: number;
    region: { identifier: string; latitude: number; longitude: number; radius: number };
  };

  // Only process enter events (eventType 1 = enter, 2 = exit)
  if (eventType !== 1) return;

  const placeId = region.identifier;
  const now = Date.now();

  // FR-008: Suppress events during boot grace period (OS replay)
  if (now - bootTimestamp < BOOT_GRACE_MS) {
    logEvent("geofence_suppressed", `boot_grace placeId=${placeId}`);
    await flushLog();
    return;
  }

  // FR-009: In-memory dedup — catches rapid-fire events before async buffer read
  const lastEnter = recentEnters.get(placeId);
  if (lastEnter !== undefined && now - lastEnter < DEDUP_WINDOW_MS) {
    return;
  }
  recentEnters.set(placeId, now);

  // Persisted buffer dedup: skip if same placeId within last 60s
  const buffer = await getGeofenceEventBuffer();
  const isDuplicate = buffer.some(
    (e) => e.placeId === placeId && now - e.enteredAt < DEDUP_WINDOW_MS,
  );

  if (isDuplicate) return;

  const eventId = randomUUID();
  await addGeofenceEvent({ placeId, enteredAt: now, eventId });

  logEvent("geofence_enter", placeId);
  await flushLog();
});
