import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { getDriverSession, clearDriverSession } from "@/storage/driver-session";
import { signOut } from "@/lib/supabase-client";
import { isShiftActive } from "@/storage/shift-state";
import { useShiftReconciliation } from "@/hooks/use-shift-reconciliation";
import Constants from "expo-constants";

export default function DriverLayout() {
  const router = useRouter();
  const [driverEmail, setDriverEmail] = useState<string>("");

  // T044: Run shift reconciliation on mount and foreground
  useShiftReconciliation();

  useEffect(() => {
    (async () => {
      const session = await getDriverSession();
      if (session) {
        setDriverEmail(session.email);
      }
    })();
  }, []);

  const handleSignOut = async () => {
    const active = await isShiftActive();
    if (active) {
      Alert.alert(
        "Turno ativo",
        "Encerre o turno antes de sair.",
        [{ text: "OK" }],
      );
      return;
    }

    try {
      await signOut();
      await clearDriverSession();
      router.replace("/login");
    } catch {
      Alert.alert("Erro", "Não foi possível sair. Tente novamente.");
    }
  };

  const handleVersionLongPress = () => {
    router.push("/support");
  };

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: "Rotas",
            headerRight: () => (
              <TouchableOpacity onPress={handleSignOut} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>Sair</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <Stack.Screen
          name="routes/[routeId]"
          options={{ title: "Rota Ativa" }}
        />
      </Stack>
      <View style={styles.footer}>
        <Text style={styles.footerEmail}>{driverEmail}</Text>
        <TouchableOpacity
          onLongPress={handleVersionLongPress}
          delayLongPress={2000}
        >
          <Text style={styles.footerVersion}>v{appVersion}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  footerEmail: {
    fontSize: 12,
    color: "#64748b",
  },
  footerVersion: {
    fontSize: 12,
    color: "#94a3b8",
  },
});
