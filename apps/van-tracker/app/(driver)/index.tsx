import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { fetchWithDriverAuth } from "@/lib/driver-api";
import { requestLocationPermissions, startTracking } from "@/location/tracking";
import { setShiftActive } from "@/storage/shift-state";
import { RouteCard } from "@/components/route-card";
import type { DriverRoute, RoutesListResponse, StartShiftResponse } from "@/types/driver";

type ShiftStartState = {
  loading: boolean;
  routeId: string | null;
};

export default function RouteListScreen() {
  const router = useRouter();
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shiftStart, setShiftStart] = useState<ShiftStartState>({
    loading: false,
    routeId: null,
  });
  const [trackingFailed, setTrackingFailed] = useState<{
    routeId: string;
    shiftId: string;
  } | null>(null);

  const fetchRoutes = useCallback(async () => {
    try {
      const response = await fetchWithDriverAuth("/api/driver/routes");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as RoutesListResponse;
      setRoutes(data.routes);
      setError(null);

      // T024: Auto-open if single in-progress route
      const inProgress = data.routes.filter(
        (r) => r.runStatus === "in_progress",
      );
      if (inProgress.length === 1) {
        router.push(`/(driver)/routes/${inProgress[0].id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar rotas",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRoutes();
    }, [fetchRoutes]),
  );

  const handleStartShift = async (route: DriverRoute) => {
    setShiftStart({ loading: true, routeId: route.id });
    setTrackingFailed(null);

    try {
      // Step 1: Request location permissions
      const granted = await requestLocationPermissions();
      if (!granted) {
        Alert.alert(
          "Permissão necessária",
          "Habilite a localização nas configurações do dispositivo.",
        );
        return;
      }

      // Step 2: Get one-shot GPS fix
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
        });
        lat = location.coords.latitude;
        lng = location.coords.longitude;
      } catch {
        // Proceed without coords — cold-start may not work
      }

      // Step 3: Call start shift API
      const body: Record<string, number> = {};
      if (lat !== undefined) body.lat = lat;
      if (lng !== undefined) body.lng = lng;

      const response = await fetchWithDriverAuth(
        `/api/routes/${route.id}/start`,
        { method: "POST", body: Object.keys(body).length > 0 ? body : undefined },
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const msg =
          (errData as { error?: { message?: string } })?.error?.message ??
          `Erro ${response.status}`;
        throw new Error(msg);
      }

      const data = (await response.json()) as StartShiftResponse;

      // Step 4: If cold start, handle it
      if (data.coldStart) {
        // For now, auto-confirm with suggested stop
        try {
          await fetchWithDriverAuth(
            `/api/routes/${route.id}/confirm-start-stop`,
            {
              method: "POST",
              body: { stopId: data.coldStart.suggestedStopId },
            },
          );
        } catch {
          // Non-fatal — cold start confirmation failure doesn't block shift
        }
      }

      // Step 5: Save shift state + start tracking
      await setShiftActive(route.id, data.shift.id);

      try {
        await startTracking({ skipPermissions: true });
      } catch {
        // Tracking failed — show recovery
        setTrackingFailed({ routeId: route.id, shiftId: data.shift.id });
        return;
      }

      // Step 6: Navigate to active route
      router.push(`/(driver)/routes/${route.id}`);
    } catch (err) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Não foi possível iniciar o turno.",
      );
    } finally {
      setShiftStart({ loading: false, routeId: null });
    }
  };

  const handleRetryTracking = async () => {
    if (!trackingFailed) return;
    try {
      await startTracking({ skipPermissions: true });
      setTrackingFailed(null);
      router.push(`/(driver)/routes/${trackingFailed.routeId}`);
    } catch {
      Alert.alert("Erro", "Não foi possível iniciar o rastreamento. Tente novamente.");
    }
  };

  const handleEndShiftFromRecovery = async () => {
    if (!trackingFailed) return;
    try {
      await fetchWithDriverAuth(
        `/api/routes/${trackingFailed.routeId}/end`,
        { method: "POST" },
      );
    } catch {
      // Force clear
    }
    const { clearShiftState } = await import("@/storage/shift-state");
    await clearShiftState();
    setTrackingFailed(null);
    fetchRoutes();
  };

  // T027: Tracking-failed recovery state
  if (trackingFailed) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Rastreamento não iniciou</Text>
        <Text style={styles.errorSubtitle}>
          O turno foi iniciado, mas o rastreamento GPS falhou.
        </Text>
        <View style={styles.recoveryActions}>
          <Text
            style={styles.retryButton}
            onPress={handleRetryTracking}
          >
            Tentar novamente
          </Text>
          <Text
            style={styles.endShiftButton}
            onPress={handleEndShiftFromRecovery}
          >
            Encerrar turno
          </Text>
        </View>
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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Erro</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
      </View>
    );
  }

  if (routes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nenhuma rota atribuída</Text>
        <Text style={styles.emptySubtitle}>
          Suas rotas aparecerão aqui quando forem atribuídas.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={routes}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <RouteCard
          route={item}
          onStartShift={
            shiftStart.loading && shiftStart.routeId === item.id
              ? undefined
              : () => handleStartShift(item)
          }
          onViewRoute={() => router.push(`/(driver)/routes/${item.id}`)}
          onEndShift={() => router.push(`/(driver)/routes/${item.id}`)}
        />
      )}
    />
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
  list: {
    padding: 16,
    backgroundColor: "#f8fafc",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
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
  recoveryActions: {
    gap: 12,
    alignItems: "center",
  },
  retryButton: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  endShiftButton: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 8,
  },
});
