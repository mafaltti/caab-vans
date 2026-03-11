import * as TaskManager from "expo-task-manager";
import { randomUUID } from "expo-crypto";
import {
  getGeofenceEventBuffer,
  addGeofenceEvent,
} from "@/storage/tracking-state";
import { logEvent, flushLog } from "@/storage/diag-log";

export const GEOFENCE_TASK = "geofence-task";

const DEDUP_WINDOW_MS = 60_000; // 60 seconds

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

  // Deduplicate: skip if same placeId within last 60s
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
