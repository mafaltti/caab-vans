import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { getSettings } from "@/storage/settings";
import { isTracking } from "@/location/tracking";
import { isShiftActive } from "@/storage/shift-state";

export default function SupportScreen() {
  const router = useRouter();
  const [vanId, setVanId] = useState<string>("—");
  const [apiUrl, setApiUrl] = useState<string>("—");
  const [trackingActive, setTrackingActive] = useState(false);
  const [shiftActive, setShiftActive] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings) {
        setVanId(settings.vanId);
        setApiUrl(settings.apiBaseUrl);
      }
      setTrackingActive(await isTracking());
      setShiftActive(await isShiftActive());
    })();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Suporte</Text>
      <Text style={styles.subtitle}>
        Controle de suporte — uso emergencial
      </Text>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Van ID</Text>
          <Text style={styles.infoValue}>{vanId}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>API URL</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {apiUrl}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Rastreamento</Text>
          <Text
            style={[
              styles.infoValue,
              trackingActive ? styles.active : styles.inactive,
            ]}
          >
            {trackingActive ? "Ativo" : "Inativo"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Turno</Text>
          <Text
            style={[
              styles.infoValue,
              shiftActive ? styles.active : styles.inactive,
            ]}
          >
            {shiftActive ? "Ativo" : "Inativo"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => router.push("/device-setup")}
      >
        <Text style={styles.linkButtonText}>Configuração do Dispositivo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => router.push("/diagnostics")}
      >
        <Text style={styles.linkButtonText}>Diagnósticos</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#d97706",
    fontWeight: "600",
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    maxWidth: "60%",
  },
  active: {
    color: "#16a34a",
  },
  inactive: {
    color: "#64748b",
  },
  linkButton: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  linkButtonText: {
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "500",
  },
});
