import "@/location/task";
import "@/location/geofence-task";
import "@/location/health-check-task";
import * as Sentry from "@sentry/react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, Redirect } from "expo-router";
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

type BootState = "loading" | "device-setup" | "login" | "driver";

function RootLayout() {
  const [bootState, setBootState] = useState<BootState>("loading");

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

        // T019: Bootstrap gate
        if (!settingsOk) {
          setBootState("device-setup");
        } else {
          const hasSession = await hasDriverSession();
          setBootState(hasSession ? "driver" : "login");
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
        const settingsOk = await isSettingsComplete().catch(() => false);
        if (!settingsOk) {
          setBootState("device-setup");
        } else {
          const hasSession = await hasDriverSession().catch(() => false);
          setBootState(hasSession ? "driver" : "login");
        }
      }
    })();
  }, []);

  if (bootState === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (bootState === "device-setup") {
    return (
      <>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="device-setup" options={{ title: "Configuração" }} />
        </Stack>
        <Redirect href="/device-setup" />
      </>
    );
  }

  if (bootState === "login") {
    return (
      <>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ title: "Login" }} />
          <Stack.Screen name="device-setup" options={{ title: "Configuração" }} />
        </Stack>
        <Redirect href="/login" />
      </>
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
