import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { hasDriverSession } from "@/storage/driver-session";

export default function HomeScreen() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const settingsOk = await isSettingsComplete().catch(() => false);
      if (!settingsOk) {
        setTarget("/device-setup");
        return;
      }
      const session = await hasDriverSession().catch(() => false);
      setTarget(session ? "/(driver)" : "/login");
    })();
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return <Redirect href={target} />;
}
