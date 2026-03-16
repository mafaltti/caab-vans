import { View, Text, StyleSheet } from "react-native";
import type { TrackerHealthInfo } from "@/types/driver";

interface TrackerHealthProps {
  health: TrackerHealthInfo | null;
}

function formatFreshness(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "agora";
  return `${minutes} min atrás`;
}

function getBatteryIcon(level: number | null): string {
  if (level === null) return "—";
  if (level >= 0.8) return "100%";
  if (level >= 0.5) return `${Math.round(level * 100)}%`;
  if (level >= 0.2) return `${Math.round(level * 100)}%`;
  return `${Math.round(level * 100)}%`;
}

export function TrackerHealth({ health }: TrackerHealthProps) {
  if (!health) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Rastreador</Text>
        <Text style={styles.noData}>Sem dados do rastreador</Text>
      </View>
    );
  }

  const isOk = !health.isStale && !health.isLowBattery;
  const statusColor = isOk ? "#15803d" : health.isStale ? "#dc2626" : "#d97706";
  const statusLabel = isOk ? "OK" : health.isStale ? "Inativo" : "Bateria baixa";

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Rastreador</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Ping</Text>
          <Text style={styles.metricValue}>
            {formatFreshness(health.minutesSinceLastPing)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Bateria</Text>
          <Text
            style={[
              styles.metricValue,
              health.isLowBattery && styles.metricDanger,
            ]}
          >
            {getBatteryIcon(health.batteryLevel)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Rede</Text>
          <Text style={styles.metricValue}>
            {health.networkType ?? "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  noData: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  metricDanger: {
    color: "#dc2626",
  },
});
