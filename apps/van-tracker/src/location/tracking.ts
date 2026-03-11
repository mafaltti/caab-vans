import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import {
  setTrackingEnabled,
  getGeofenceRegions,
  clearGeofenceState,
} from "@/storage/tracking-state";
import { logEvent, flushLog } from "@/storage/diag-log";
import { getSettings } from "@/storage/settings";
import { fetchTrackerConfig } from "@/api/config";
import { BACKGROUND_LOCATION_TASK } from "./task";
import { GEOFENCE_TASK } from "./geofence-task";

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

  await setTrackingEnabled(true);
  try {
    logEvent("tracking_start");
    await flushLog();
  } catch {
    // Diagnostics should never block tracking lifecycle
  }

  // Register geofence regions after location updates start
  try {
    await registerGeofences();
  } catch {
    // Geofence registration failure is non-fatal — GPS tracking continues
  }

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

  // Unregister geofences and clear cached state
  try {
    const geofenceRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (geofenceRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
    await clearGeofenceState();
  } catch {
    // Geofence cleanup failure is non-fatal
  }

  await setTrackingEnabled(false);
  try {
    logEvent("tracking_stop");
    await flushLog();
  } catch {
    // Diagnostics should never block tracking lifecycle
  }
}

async function registerGeofences(): Promise<void> {
  const settings = await getSettings();
  if (!settings) return;

  const config = await fetchTrackerConfig(settings);
  if (!config || config.geofenceRegions.length === 0) return;

  await startGeofencingWithRegions(config.geofenceRegions);
  logEvent("geofence_register", `${config.geofenceRegions.length} regions`);
}

export async function registerGeofencesFromCache(): Promise<void> {
  const regions = await getGeofenceRegions();
  if (regions.length === 0) {
    // No regions in cache — unregister stale OS geofences if any
    const registered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (registered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
      logEvent("geofence_register", "0 regions (stale cleared)");
    }
    return;
  }

  await startGeofencingWithRegions(regions);
  logEvent("geofence_register", `${regions.length} regions (cache)`);
}

async function startGeofencingWithRegions(
  regions: { placeId: string; lat: number; lng: number; radius: number }[],
): Promise<void> {
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    regions.map((r) => ({
      identifier: r.placeId,
      latitude: r.lat,
      longitude: r.lng,
      radius: r.radius,
      notifyOnEnter: true,
      notifyOnExit: false,
    })),
  );
}

export async function isTracking(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}
