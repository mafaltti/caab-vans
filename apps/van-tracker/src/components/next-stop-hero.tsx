import { View, Text, StyleSheet } from "react-native";

interface NextStopHeroProps {
  stopName: string | null;
  arrivalTime: string | null;
  eta: string | null;
  delayMinutes: number | null;
  isCompleted: boolean;
}

export function NextStopHero({
  stopName,
  arrivalTime,
  eta,
  delayMinutes,
  isCompleted,
}: NextStopHeroProps) {
  if (isCompleted) {
    return (
      <View style={styles.container}>
        <Text style={styles.completedText}>Rota concluída</Text>
      </View>
    );
  }

  if (!stopName) {
    return (
      <View style={styles.container}>
        <Text style={styles.noStopText}>Nenhuma parada próxima</Text>
      </View>
    );
  }

  const hasDelay = delayMinutes !== null && delayMinutes !== 0;
  const isEarly = delayMinutes !== null && delayMinutes < 0;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Próxima parada</Text>
      <Text style={styles.stopName}>{stopName}</Text>
      <View style={styles.timeRow}>
        {arrivalTime && <Text style={styles.arrivalTime}>{arrivalTime}</Text>}
        {eta && <Text style={styles.eta}>~{eta}</Text>}
        {hasDelay && (
          <View
            style={[
              styles.delayBadge,
              isEarly ? styles.earlyBadge : styles.lateBadge,
            ]}
          >
            <Text
              style={[
                styles.delayText,
                isEarly ? styles.earlyText : styles.lateText,
              ]}
            >
              {isEarly ? `${delayMinutes}min` : `+${delayMinutes}min`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  label: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  stopName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  arrivalTime: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
  },
  eta: {
    fontSize: 14,
    color: "#64748b",
  },
  delayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  lateBadge: {
    backgroundColor: "#fef2f2",
  },
  earlyBadge: {
    backgroundColor: "#dcfce7",
  },
  delayText: {
    fontSize: 12,
    fontWeight: "700",
  },
  lateText: {
    color: "#dc2626",
  },
  earlyText: {
    color: "#15803d",
  },
  completedText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#15803d",
    textAlign: "center",
  },
  noStopText: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
  },
});
