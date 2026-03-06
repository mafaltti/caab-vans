import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { setTrackingEnabled } from "@/storage/tracking-state";
import { logEvent, flushLog } from "@/storage/diag-log";
import { BACKGROUND_LOCATION_TASK } from "./task";

let batterySubscription: Battery.Subscription | null = null;
let isLowBattery = false;

async function updateLocationAccuracy(highAccuracy: boolean): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (!isRegistered) return;

  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: highAccuracy
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced,
    timeInterval: highAccuracy ? 5000 : 10000,
    distanceInterval: 10,
    foregroundService: {
      notificationTitle: "CAAB Tracker",
      notificationBody: highAccuracy
        ? "Sharing location"
        : "Sharing location (battery saver)",
      notificationColor: "#2563eb",
      killServiceOnDestroy: false,
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
}

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
      await Notifications.requestPermissionsAsync();
    if (notifStatus !== "granted") {
      console.warn(
        "[CAAB Tracker] Notification permission not granted; foreground service notification may not show.",
      );
    }
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    foregroundService: {
      notificationTitle: "CAAB Tracker",
      notificationBody: "Sharing location",
      notificationColor: "#2563eb",
      killServiceOnDestroy: false,
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });

  logEvent("tracking_start");
  await flushLog();
  await setTrackingEnabled(true);

  const level = await Battery.getBatteryLevelAsync();
  isLowBattery = level < 0.2;
  if (isLowBattery) {
    await updateLocationAccuracy(false);
  }

  batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
    (async () => {
      try {
        if (batteryLevel < 0.2 && !isLowBattery) {
          isLowBattery = true;
          await updateLocationAccuracy(false);
        } else if (batteryLevel > 0.25 && isLowBattery) {
          isLowBattery = false;
          await updateLocationAccuracy(true);
        }
      } catch {
        // Location accuracy switch failed — non-fatal, keep current mode
      }
    })();
  });
}

export async function stopTracking(): Promise<void> {
  if (batterySubscription) {
    batterySubscription.remove();
    batterySubscription = null;
  }
  isLowBattery = false;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  logEvent("tracking_stop");
  await flushLog();
  await setTrackingEnabled(false);
}

export async function isTracking(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}
