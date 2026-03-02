import "@/location/task";
import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { getLastSentAt } from "@/storage/tracking-state";
import { startTracking, stopTracking, isTracking } from "@/location/tracking";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function HomeScreen() {
  const router = useRouter();
  const [settingsReady, setSettingsReady] = useState<boolean | null>(null);
  const [tracking, setTracking] = useState(false);
  const [lastSentAt, setLastSentAtState] = useState<number | null>(null);
  const [lastLat, setLastLat] = useState<number | null>(null);
  const [lastLng, setLastLng] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkSettings = useCallback(async () => {
    const complete = await isSettingsComplete();
    setSettingsReady(complete);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const active = await isTracking();
      setTracking(active);

      const ts = await getLastSentAt();
      setLastSentAtState(ts);

      const lat = await AsyncStorage.getItem("@lastLat");
      const lng = await AsyncStorage.getItem("@lastLng");
      const err = await AsyncStorage.getItem("@lastError");

      setLastLat(lat ? Number(lat) : null);
      setLastLng(lng ? Number(lng) : null);
      setLastError(err);
    } catch {
      // Silently handle read errors
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkSettings();
      refreshStatus();

      intervalRef.current = setInterval(refreshStatus, 2000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [checkSettings, refreshStatus]),
  );

  const handleStart = async () => {
    setLoading(true);
    setActionError(null);
    try {
      await startTracking();
      setTracking(true);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to start tracking",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setActionError(null);
    try {
      await stopTracking();
      setTracking(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to stop tracking",
      );
    } finally {
      setLoading(false);
    }
  };

  if (settingsReady === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!settingsReady) {
    return (
      <View style={styles.center}>
        <Text style={styles.messageText}>
          Configure settings to start tracking
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.buttonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <View
            style={[
              styles.statusBadge,
              tracking ? styles.badgeActive : styles.badgeInactive,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                tracking ? styles.badgeActiveText : styles.badgeInactiveText,
              ]}
            >
              {tracking ? "TRACKING" : "OFF"}
            </Text>
          </View>
        </View>

        {lastSentAt && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Last sent</Text>
            <Text style={styles.statusValue}>
              {new Date(lastSentAt).toLocaleTimeString()}
            </Text>
          </View>
        )}

        {lastLat !== null && lastLng !== null && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Coordinates</Text>
            <Text style={styles.statusValue}>
              {lastLat.toFixed(6)}, {lastLng.toFixed(6)}
            </Text>
          </View>
        )}

        {lastError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{lastError}</Text>
          </View>
        )}
      </View>

      {actionError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{actionError}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          tracking ? styles.stopButton : styles.startButton,
        ]}
        onPress={tracking ? handleStop : handleStart}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {tracking ? "Stop Tracking" : "Start Tracking"}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push("/settings")}
      >
        <Text style={styles.secondaryButtonText}>Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
  },
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  messageText: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: "#64748b",
  },
  statusValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeActive: {
    backgroundColor: "#dcfce7",
  },
  badgeInactive: {
    backgroundColor: "#f1f5f9",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeActiveText: {
    color: "#16a34a",
  },
  badgeInactiveText: {
    color: "#64748b",
  },
  errorRow: {
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#dc2626",
  },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: "#dc2626",
    fontSize: 14,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: "#2563eb",
  },
  stopButton: {
    backgroundColor: "#dc2626",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  secondaryButtonText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "500",
  },
});
