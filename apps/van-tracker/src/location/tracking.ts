import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { setTrackingEnabled } from "@/storage/tracking-state";
import { BACKGROUND_LOCATION_TASK } from "./task";

export async function startTracking(): Promise<void> {
  const { status: fgStatus } =
    await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    throw new Error(
      "Foreground location permission denied. Please enable location access in Settings.",
    );
  }

  const { status: bgStatus } =
    await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== "granted") {
    throw new Error(
      'Background location permission denied. Please select "Allow all the time" in Settings.',
    );
  }

  if (Platform.OS === "android" && Platform.Version >= 33) {
    const { status: notifStatus } =
      await Location.requestForegroundPermissionsAsync();
    // Notification permission is best-effort on Android 13+
    if (notifStatus !== "granted") {
      console.warn(
        "[CAAB Tracker] Notification permission not granted; foreground service notification may not show.",
      );
    }
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 5,
    foregroundService: {
      notificationTitle: "CAAB Tracker",
      notificationBody: "Sharing location",
      notificationColor: "#2563eb",
      killServiceOnDestroy: false,
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });

  await setTrackingEnabled(true);
}

export async function stopTracking(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  await setTrackingEnabled(false);
}

export async function isTracking(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}
