import "@/location/task";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { startTracking } from "@/location/tracking";

export default function RootLayout() {
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
