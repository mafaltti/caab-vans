import AsyncStorage from "@react-native-async-storage/async-storage";
import { setTrackingEnabledDeviceProtected } from "./device-protected-state";
import type { GeofenceRegion, GeofenceEvent } from "@/types";

export async function getTrackingEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem("@trackingEnabled");
  return value === "true";
}

export async function setTrackingEnabled(flag: boolean): Promise<void> {
  const [primary] = await Promise.allSettled([
    AsyncStorage.setItem("@trackingEnabled", String(flag)),
    setTrackingEnabledDeviceProtected(flag),
  ]);

  if (primary.status === "rejected") {
    throw primary.reason;
  }
}

export async function getLastSentAt(): Promise<number | null> {
  const value = await AsyncStorage.getItem("@lastSentAt");
  if (value === null) return null;
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

export async function setLastSentAt(ts: number): Promise<void> {
  await AsyncStorage.setItem("@lastSentAt", String(ts));
}

export async function getLastTaskInvocationAt(): Promise<number | null> {
  const value = await AsyncStorage.getItem("@lastTaskInvocationAt");
  if (value === null) return null;
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

export async function getAuthPaused(): Promise<boolean> {
  const value = await AsyncStorage.getItem("@authPaused");
  return value === "true";
}

export async function getGeofenceRegions(): Promise<GeofenceRegion[]> {
  const value = await AsyncStorage.getItem("@geofenceRegions");
  if (value === null) return [];
  return JSON.parse(value);
}

export async function setGeofenceRegions(
  regions: GeofenceRegion[],
): Promise<void> {
  await AsyncStorage.setItem("@geofenceRegions", JSON.stringify(regions));
}

export async function getGeofenceConfigVersion(): Promise<string | null> {
  return AsyncStorage.getItem("@geofenceConfigVersion");
}

export async function setGeofenceConfigVersion(
  version: string,
): Promise<void> {
  await AsyncStorage.setItem("@geofenceConfigVersion", version);
}

export async function getGeofenceEventBuffer(): Promise<GeofenceEvent[]> {
  const value = await AsyncStorage.getItem("@geofenceEventBuffer");
  if (value === null) return [];
  return JSON.parse(value);
}

export async function addGeofenceEvent(event: GeofenceEvent): Promise<void> {
  const buffer = await getGeofenceEventBuffer();
  buffer.push(event);
  await AsyncStorage.setItem("@geofenceEventBuffer", JSON.stringify(buffer));
}

export async function removeGeofenceEvents(
  eventIds: string[],
): Promise<void> {
  const buffer = await getGeofenceEventBuffer();
  const filtered = buffer.filter((e) => !eventIds.includes(e.eventId));
  await AsyncStorage.setItem("@geofenceEventBuffer", JSON.stringify(filtered));
}

export async function clearGeofenceState(): Promise<void> {
  await AsyncStorage.multiRemove([
    "@geofenceRegions",
    "@geofenceConfigVersion",
    "@geofenceEventBuffer",
  ]);
}
