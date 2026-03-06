import "@/location/task";
import * as Sentry from "@sentry/react-native";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { startTracking } from "@/location/tracking";

Sentry.init({
  dsn: "https://b223f5cc68a43affcb6a932af31b4350@o4510995190972416.ingest.us.sentry.io/4510995205128192",
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.2,
  enableNativeCrashHandling: true,
});

function RootLayout() {
  useEffect(() => {
    (async () => {
      try {
        const wasTracking = await getTrackingEnabled();
        const settingsOk = await isSettingsComplete();
        if (wasTracking && settingsOk) {
          await startTracking();
        }
      } catch {
        // Permission issues on resume are non-fatal — user can manually restart
      }
    })();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "CAAB Tracker" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}

export default Sentry.wrap(RootLayout);
