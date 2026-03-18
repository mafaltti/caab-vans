import "@/location/task";
import "@/location/geofence-task";
import "@/location/health-check-task";
import * as Sentry from "@sentry/react-native";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { startTracking, registerGeofencesFromCache } from "@/location/tracking";
import {
  consumeBootTrigger,
  syncTrackingStateToDeviceProtected,
} from "@/storage/device-protected-state";
import { logEvent, flushLog } from "@/storage/diag-log";
import { useKeepAwakeWhileForeground } from "@/hooks/useKeepAwakeWhileForeground";

Sentry.init({
  dsn: "https://b223f5cc68a43affcb6a932af31b4350@o4510995190972416.ingest.us.sentry.io/4510995205128192",
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.2,
  enableNativeCrashHandling: true,
});

function RootLayout() {
  useKeepAwakeWhileForeground();

  useEffect(() => {
    (async () => {
      let bootTrigger: string | null = null;
      try {
        bootTrigger = await consumeBootTrigger();
        const wasTracking = await getTrackingEnabled();
        // Migrate pre-existing tracking state to device-protected storage
        await syncTrackingStateToDeviceProtected(wasTracking);
        const settingsOk = await isSettingsComplete();
        if (wasTracking && settingsOk) {
          await startTracking();
          // Re-register geofences from cache on boot (no network wait)
          try {
            await registerGeofencesFromCache();
          } catch {
            // Non-fatal — geofences will re-register on next config fetch
          }
          if (bootTrigger) {
            logEvent("boot_restart", bootTrigger);
            await flushLog();
          }
        } else if (bootTrigger) {
          const reason = !wasTracking
            ? "tracking_not_enabled"
            : "settings_incomplete";
          logEvent("boot_restart", `error: ${reason}`);
          await flushLog();
        }
      } catch (err) {
        if (bootTrigger) {
          const msg =
            err instanceof Error ? err.message : "unknown_error";
          logEvent("boot_restart", `error: ${msg}`);
          try {
            await flushLog();
          } catch {
            // Diagnostics should never block error handling
          }
        }
        // Permission issues on resume are non-fatal — user can manually restart
      }
    })();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "CAAB Tracker" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
      <Stack.Screen name="driver" options={{ title: "Driver", headerShown: false }} />
    </Stack>
  );
}

export default Sentry.wrap(RootLayout);
