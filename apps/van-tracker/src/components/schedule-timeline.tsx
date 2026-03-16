import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { RouteDetailStop } from "@/types/driver";

interface ScheduleTimelineProps {
  stops: RouteDetailStop[];
  currentStopIndex: number | null;
}

export function ScheduleTimeline({ stops, currentStopIndex }: ScheduleTimelineProps) {
  const [showPast, setShowPast] = useState(false);

  const pastStops = currentStopIndex !== null
    ? stops.slice(0, currentStopIndex)
    : [];
  const visibleStops = currentStopIndex !== null && !showPast
    ? stops.slice(currentStopIndex)
    : stops;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cronograma</Text>

      {pastStops.length > 0 && !showPast && (
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowPast(true)}
        >
          <Text style={styles.toggleText}>
            Mostrar {pastStops.length} parada{pastStops.length > 1 ? "s" : ""} anterior{pastStops.length > 1 ? "es" : ""}
          </Text>
        </TouchableOpacity>
      )}

      {showPast && pastStops.length > 0 && (
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowPast(false)}
        >
          <Text style={styles.toggleText}>Ocultar paradas anteriores</Text>
        </TouchableOpacity>
      )}

      {visibleStops.map((stop, i) => {
        const globalIndex = showPast ? i : (currentStopIndex ?? 0) + i;
        const isCurrent = globalIndex === currentStopIndex;
        const isPast = stop.status === "passed";
        const isSkipped = stop.status === "skipped";

        return (
          <View key={stop.id} style={styles.stopRow}>
            <View style={styles.timeline}>
              <View
                style={[
                  styles.dot,
                  isCurrent && styles.dotCurrent,
                  isPast && styles.dotPast,
                  isSkipped && styles.dotSkipped,
                ]}
              />
              {i < visibleStops.length - 1 && (
                <View
                  style={[
                    styles.line,
                    (isPast || isSkipped) && styles.linePast,
                  ]}
                />
              )}
            </View>
            <View style={styles.stopInfo}>
              <Text
                style={[
                  styles.stopName,
                  isPast && styles.stopNamePast,
                  isSkipped && styles.stopNameSkipped,
                ]}
              >
                {stop.stopName}
                {isSkipped ? " (pulada)" : ""}
              </Text>
              <Text style={styles.stopTime}>
                {stop.arrivalTime}
                {stop.passedAt
                  ? ` · passou ${new Date(stop.passedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </Text>
            </View>
          </View>
        );
      })}
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
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
  },
  toggleButton: {
    marginBottom: 12,
  },
  toggleText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "500",
  },
  stopRow: {
    flexDirection: "row",
    minHeight: 48,
  },
  timeline: {
    width: 24,
    alignItems: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    marginTop: 4,
  },
  dotCurrent: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  dotPast: {
    backgroundColor: "#94a3b8",
    borderColor: "#94a3b8",
  },
  dotSkipped: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: "#e2e8f0",
    marginVertical: 2,
  },
  linePast: {
    backgroundColor: "#cbd5e1",
  },
  stopInfo: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 12,
  },
  stopName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  stopNamePast: {
    color: "#94a3b8",
  },
  stopNameSkipped: {
    color: "#d97706",
  },
  stopTime: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
});
