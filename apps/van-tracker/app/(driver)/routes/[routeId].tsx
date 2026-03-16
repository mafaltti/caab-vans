import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fetchWithDriverAuth } from "@/lib/driver-api";
import { clearShiftState } from "@/storage/shift-state";
import { stopTracking } from "@/location/tracking";
import { NextStopHero } from "@/components/next-stop-hero";
import { TrackerHealth } from "@/components/tracker-health";
import { ScheduleTimeline } from "@/components/schedule-timeline";
import { ExceptionDrawer } from "@/components/exception-drawer";
import type { RouteDetail, RouteDetailResponse } from "@/types/driver";

const POLL_INTERVAL = 5000;

export default function ActiveRouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);
  const [trackingStopFailed, setTrackingStopFailed] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRoute = useCallback(async () => {
    if (!routeId) return;
    try {
      const response = await fetchWithDriverAuth(
        `/api/driver/routes/${routeId}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as RouteDetailResponse;
      setRoute(data.route);
      setError(null);

      // Auto-redirect if route not running
      if (!data.route.isRunning && !endingShift) {
        router.replace("/(driver)");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar rota");
    } finally {
      setLoading(false);
    }
  }, [routeId, router, endingShift]);

  useEffect(() => {
    fetchRoute();
    intervalRef.current = setInterval(fetchRoute, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRoute]);

  // T035: End shift orchestration
  const handleEndShift = async () => {
    Alert.alert(
      "Encerrar turno",
      "Tem certeza que deseja encerrar o turno?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Encerrar",
          style: "destructive",
          onPress: async () => {
            setEndingShift(true);
            if (intervalRef.current) clearInterval(intervalRef.current);

            try {
              const response = await fetchWithDriverAuth(
                `/api/routes/${routeId}/end`,
                { method: "POST" },
              );
              if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(
                  (errData as { error?: { message?: string } })?.error?.message ??
                    `Erro ${response.status}`,
                );
              }

              // T036: Try to stop tracking
              try {
                await stopTracking();
              } catch {
                setTrackingStopFailed(true);
                return;
              }

              await clearShiftState();
              router.replace("/(driver)");
            } catch (err) {
              Alert.alert(
                "Erro",
                err instanceof Error
                  ? err.message
                  : "Não foi possível encerrar o turno.",
              );
              setEndingShift(false);
              intervalRef.current = setInterval(fetchRoute, POLL_INTERVAL);
            }
          },
        },
      ],
    );
  };

  const handleRetryStopTracking = async () => {
    try {
      await stopTracking();
      await clearShiftState();
      setTrackingStopFailed(false);
      router.replace("/(driver)");
    } catch {
      Alert.alert("Erro", "Não foi possível parar o rastreamento. Tente novamente.");
    }
  };

  // T036: Tracking-stop-failed recovery
  if (trackingStopFailed) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Rastreamento não parou</Text>
        <Text style={styles.errorSubtitle}>
          O turno foi encerrado no servidor, mas o rastreamento GPS continua.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetryStopTracking}>
          <Text style={styles.retryButtonText}>Parar rastreamento</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !route) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Erro</Text>
        <Text style={styles.errorSubtitle}>{error ?? "Rota não encontrada"}</Text>
      </View>
    );
  }

  // Derive next stop info
  const nextStop =
    route.currentStopIndex !== null
      ? route.schedule[route.currentStopIndex]
      : null;

  const isCompleted = route.progress?.runStatus === "completed";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Detour banner */}
      {route.progress?.isDetourActive && (
        <View style={styles.detourBanner}>
          <Text style={styles.detourText}>Em desvio</Text>
          {route.progress.detourReasonCode && (
            <Text style={styles.detourReason}>
              {route.progress.detourReasonCode}
            </Text>
          )}
        </View>
      )}

      <NextStopHero
        stopName={nextStop?.stopName ?? null}
        arrivalTime={nextStop?.arrivalTime ?? null}
        eta={route.progress?.nextStopEta ?? null}
        delayMinutes={route.progress?.delayMinutes ?? null}
        isCompleted={isCompleted}
      />

      <TrackerHealth health={route.trackerHealth} />

      <ScheduleTimeline
        stops={route.schedule}
        currentStopIndex={route.currentStopIndex}
      />

      {/* Exception Drawer */}
      <ExceptionDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        nextStop={nextStop ?? null}
        isDetourActive={route.progress?.isDetourActive ?? false}
        onSkipStop={async (reasonCode, note) => {
          if (!nextStop) return;
          const res = await fetchWithDriverAuth(
            `/api/routes/${routeId}/skip-stop`,
            { method: "POST", body: { stopId: nextStop.id, reasonCode, note } },
          );
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(
              (err as { error?: { message?: string } })?.error?.message ?? `Erro ${res.status}`,
            );
          }
          fetchRoute();
        }}
        onDetourToggle={async (action, reasonCode, note) => {
          const res = await fetchWithDriverAuth(
            `/api/routes/${routeId}/detour`,
            { method: "POST", body: { action, reasonCode, note } },
          );
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(
              (err as { error?: { message?: string } })?.error?.message ?? `Erro ${res.status}`,
            );
          }
          fetchRoute();
        }}
      />

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionsButton}
          onPress={() => setDrawerVisible(true)}
        >
          <Text style={styles.actionsButtonText}>Ações</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.endButton, endingShift && styles.buttonDisabled]}
          onPress={handleEndShift}
          disabled={endingShift}
        >
          {endingShift ? (
            <ActivityIndicator size="small" color="#dc2626" />
          ) : (
            <Text style={styles.endButtonText}>Encerrar Turno</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#dc2626",
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  detourBanner: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detourText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700",
  },
  detourReason: {
    color: "#dc2626",
    fontSize: 13,
  },
  actions: {
    gap: 8,
    marginTop: 8,
  },
  actionsButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionsButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  endButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  endButtonText: {
    color: "#dc2626",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
