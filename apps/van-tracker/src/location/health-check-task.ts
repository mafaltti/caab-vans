import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { logEvent, flushLog } from "@/storage/diag-log";
import { BACKGROUND_LOCATION_TASK } from "./task";

const HEALTH_CHECK_TASK = "health-check-task";
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

TaskManager.defineTask(HEALTH_CHECK_TASK, async () => {
  try {
    const trackingEnabled = await getTrackingEnabled();
    if (!trackingEnabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Check if location task is still running
    const isRunning =
      await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!isRunning) {
      logEvent("health_recovery", "start:health");
      await flushLog();
      const { startTracking } = await import("./tracking");
      await startTracking({ interactive: false, source: "health" });
      logEvent("health_recovery", "ok:health");
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    // Check if task invocations are stale (OS throttled the task)
    const lastInvocation = await AsyncStorage.getItem("@lastTaskInvocationAt");
    if (lastInvocation) {
      const elapsed = Date.now() - Number(lastInvocation);
      if (elapsed > STALE_THRESHOLD_MS) {
        logEvent("health_recovery", "start:health");
        await flushLog();
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        const { startTracking } = await import("./tracking");
        await startTracking({ interactive: false, source: "health" });
        logEvent("health_recovery", "ok:health");
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    logEvent("health_recovery", msg.startsWith("skip:") ? msg : "fail:" + msg);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerHealthCheck(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(HEALTH_CHECK_TASK, {
    minimumInterval: 15 * 60, // 15 minutes (Android platform minimum)
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unregisterHealthCheck(): Promise<void> {
  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(HEALTH_CHECK_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(HEALTH_CHECK_TASK);
  }
}
