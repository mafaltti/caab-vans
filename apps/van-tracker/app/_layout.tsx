import "@/location/task";
import "@/location/geofence-task";
import "@/location/health-check-task";
import * as Sentry from "@sentry/react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { startTracking, registerGeofencesFromCache } from "@/location/tracking";
import {
  consumeBootTrigger,
  syncTrackingStateToDeviceProtected,
  getShiftActiveDeviceProtected,
} from "@/storage/device-protected-state";
import { hasDriverSession } from "@/storage/driver-session";
import { logEvent, flushLog } from "@/storage/diag-log";

Sentry.init({
  dsn: "https://b223f5cc68a43affcb6a932af31b4350@o4510995190972416.ingest.us.sentry.io/4510995205128192",
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.2,
  enableNativeCrashHandling: true,
});

function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let bootTrigger: string | null = null;
      try {
        bootTrigger = await consumeBootTrigger();
        const wasTracking = await getTrackingEnabled();
        await syncTrackingStateToDeviceProtected(wasTracking);
        const settingsOk = await isSettingsComplete();

        // T042: Shift-gated boot recovery
        const shiftActive = await getShiftActiveDeviceProtected();
        if (wasTracking && settingsOk && shiftActive) {
          await startTracking({ skipPermissions: true });
          try {
            await registerGeofencesFromCache();
          } catch {
            // Non-fatal
          }
          if (bootTrigger) {
            logEvent("boot_restart", bootTrigger);
            await flushLog();
          }
        } else if (bootTrigger) {
          const reason = !wasTracking
            ? "tracking_not_enabled"
            : !settingsOk
              ? "settings_incomplete"
              : "shift_not_active";
          logEvent("boot_restart", `error: ${reason}`);
          await flushLog();
        }

        // T019: Bootstrap gate — navigate imperatively so the layout
        // doesn't permanently render a <Redirect> that blocks later navigation
        setReady(true);
        if (!settingsOk) {
          router.replace("/device-setup");
        } else {
          const hasSession = await hasDriverSession();
          router.replace(hasSession ? "/(driver)" : "/login");
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
        // Fall through to check settings for navigation
        setReady(true);
        const settingsOk = await isSettingsComplete().catch(() => false);
        if (!settingsOk) {
          router.replace("/device-setup");
        } else {
          const hasSession = await hasDriverSession().catch(() => false);
          router.replace(hasSession ? "/(driver)" : "/login");
        }
      }
    })();
  }, [router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "Login", headerShown: false }} />
      <Stack.Screen name="device-setup" options={{ title: "Configuração" }} />
      <Stack.Screen name="support" options={{ title: "Suporte" }} />
      <Stack.Screen name="diagnostics" options={{ title: "Diagnósticos" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="index" options={{ title: "CAAB Tracker" }} />
    </Stack>
  );
}

export default Sentry.wrap(RootLayout);
