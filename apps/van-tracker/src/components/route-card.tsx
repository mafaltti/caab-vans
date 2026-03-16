import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { DriverRoute } from "@/types/driver";

interface RouteCardProps {
  route: DriverRoute;
  onStartShift?: () => void;
  onEndShift?: () => void;
  onViewRoute?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  waiting: "Aguardando",
  in_progress: "Em andamento",
  completed: "Concluída",
  no_run: "Sem viagem",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  waiting: { bg: "#fef3c7", text: "#a16207" },
  in_progress: { bg: "#dbeafe", text: "#1d4ed8" },
  completed: { bg: "#dcfce7", text: "#15803d" },
  no_run: { bg: "#f1f5f9", text: "#64748b" },
};

export function RouteCard({ route, onStartShift, onEndShift, onViewRoute }: RouteCardProps) {
  const statusColor = STATUS_COLORS[route.runStatus] ?? STATUS_COLORS.no_run;
  const isInProgress = route.runStatus === "in_progress";
  const isWaiting = route.runStatus === "waiting" || route.runStatus === "no_run";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.routeName}>{route.name}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>
              {STATUS_LABELS[route.runStatus] ?? route.runStatus}
            </Text>
          </View>
        </View>
        <Text style={styles.vanName}>{route.vanName}</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          {route.totalStops} paradas
          {route.firstStopTime && route.lastStopTime
            ? ` · ${route.firstStopTime} – ${route.lastStopTime}`
            : ""}
        </Text>
      </View>

      {route.hasSkippedStops && (
        <Text style={styles.warningText}>Paradas puladas</Text>
      )}
      {route.isDetourActive && (
        <Text style={styles.detourText}>Em desvio</Text>
      )}

      <View style={styles.actions}>
        {isInProgress && onViewRoute && (
          <TouchableOpacity style={styles.primaryButton} onPress={onViewRoute}>
            <Text style={styles.primaryButtonText}>Ver Rota</Text>
          </TouchableOpacity>
        )}
        {isInProgress && onEndShift && (
          <TouchableOpacity style={styles.dangerButton} onPress={onEndShift}>
            <Text style={styles.dangerButtonText}>Encerrar Turno</Text>
          </TouchableOpacity>
        )}
        {isWaiting && onStartShift && (
          <TouchableOpacity style={styles.primaryButton} onPress={onStartShift}>
            <Text style={styles.primaryButtonText}>Iniciar Turno</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  routeName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  vanName: {
    fontSize: 13,
    color: "#64748b",
  },
  info: {
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#475569",
  },
  warningText: {
    fontSize: 12,
    color: "#d97706",
    marginBottom: 4,
  },
  detourText: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "600",
    marginBottom: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  dangerButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
  },
});
