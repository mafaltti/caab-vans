import "@/location/task";
import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  AppState,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import {
  getLastSentAt,
  getTrackingEnabled,
  getLastTaskInvocationAt,
  getAuthPaused,
} from "@/storage/tracking-state";
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
  const [showTaskKillModal, setShowTaskKillModal] = useState(false);
  const [isAuthPaused, setIsAuthPaused] = useState(false);
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

      const paused = await getAuthPaused();
      setIsAuthPaused(paused);
    } catch {
      // Silently handle read errors
    }
  }, []);

  // US3: Task kill detection on app foreground resume
  const checkTaskKill = useCallback(async () => {
    try {
      const trackingEnabled = await getTrackingEnabled();
      if (!trackingEnabled) return;

      const lastInvocation = await getLastTaskInvocationAt();
      if (lastInvocation === null) return;

      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - lastInvocation > staleThreshold) {
        setShowTaskKillModal(true);
      }
    } catch {
      // Silently handle
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkSettings();
      refreshStatus();
      checkTaskKill();

      intervalRef.current = setInterval(refreshStatus, 2000);

      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          checkTaskKill();
        }
      });

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        subscription.remove();
      };
    }, [checkSettings, refreshStatus, checkTaskKill]),
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

  const handleRestart = async () => {
    setLoading(true);
    setActionError(null);
    setShowTaskKillModal(false);
    try {
      await stopTracking();
      await startTracking();
      setTracking(true);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to restart tracking",
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

      {isAuthPaused && (
        <View style={styles.authBanner}>
          <Text style={styles.authBannerText}>
            Authentication failed. Check your token in Settings.
          </Text>
          <TouchableOpacity
            style={styles.authBannerButton}
            onPress={() => router.push("/settings")}
          >
            <Text style={styles.authBannerButtonText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {actionError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{actionError}</Text>
        </View>
      )}

      <Modal
        visible={showTaskKillModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTaskKillModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tracking May Have Stopped</Text>
            <Text style={styles.modalMessage}>
              {"The background task hasn't run recently. Android may have stopped"}
              it to save battery.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.startButton]}
              onPress={handleRestart}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Restart Tracking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowTaskKillModal(false)}
            >
              <Text style={styles.secondaryButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
        style={[styles.primaryButton, styles.driverButton]}
        onPress={() => router.push("/driver")}
      >
        <Text style={styles.buttonText}>Open Driver</Text>
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
  driverButton: {
    backgroundColor: "#059669",
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
  authBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  authBannerText: {
    color: "#92400e",
    fontSize: 14,
    marginBottom: 8,
  },
  authBannerButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#f59e0b",
    borderRadius: 6,
  },
  authBannerButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 20,
    lineHeight: 20,
  },
});
