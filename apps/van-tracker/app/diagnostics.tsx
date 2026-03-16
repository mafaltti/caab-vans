import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  getLog,
  clearLog,
  type LogEntry,
  type MinuteSummary,
  type EventEntry,
} from "@/storage/diag-log";
import { startTracking, stopTracking, isTracking } from "@/location/tracking";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTimeSeconds(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getMinuteColor(s: MinuteSummary): string {
  if (s.ok === 0 && s.fail === 0 && s.buf === 0) return "#f3f4f6"; // gray — idle
  if (s.fail > s.ok) return "#fecaca"; // red
  if (s.fail > 0 || s.buf > 0) return "#fef3c7"; // yellow
  return "#dcfce7"; // green
}

function getEventColor(e: EventEntry): string {
  switch (e.e) {
    case "error":
    case "task_error":
    case "buffer_full":
      return "#fecaca"; // red
    case "state_change":
    case "network_up":
    case "network_down":
      return "#dbeafe"; // blue
    default:
      return "#f3f4f6"; // gray
  }
}

function SummaryBar({ entries }: { entries: LogEntry[] }) {
  const summaries = entries.filter(
    (e): e is MinuteSummary => e.type === "summary",
  );
  const totals = summaries.reduce(
    (acc, s) => ({
      ok: acc.ok + s.ok,
      fail: acc.fail + s.fail,
      buf: acc.buf + s.buf,
      thr: acc.thr + s.thr,
      flt: acc.flt + s.flt,
      flt_acc: acc.flt_acc + (s.flt_acc ?? 0),
      flt_dup: acc.flt_dup + (s.flt_dup ?? 0),
      flt_stale: acc.flt_stale + (s.flt_stale ?? 0),
    }),
    { ok: 0, fail: 0, buf: 0, thr: 0, flt: 0, flt_acc: 0, flt_dup: 0, flt_stale: 0 },
  );

  return (
    <View style={styles.summaryBar}>
      <Text style={styles.summaryTitle}>Totals</Text>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryItem, styles.summaryOk]}>
          OK {totals.ok}
        </Text>
        <Text style={[styles.summaryItem, styles.summaryFail]}>
          Fail {totals.fail}
        </Text>
        <Text style={[styles.summaryItem, styles.summaryBuf]}>
          Buf {totals.buf}
        </Text>
        <Text style={[styles.summaryItem, styles.summaryThr]}>
          Thr {totals.thr}
        </Text>
        <Text style={[styles.summaryItem, styles.summaryFlt]}>
          Flt {totals.flt} [a:{totals.flt_acc} d:{totals.flt_dup} s:{totals.flt_stale}]
        </Text>
      </View>
    </View>
  );
}

function MinuteRow({ item }: { item: MinuteSummary }) {
  return (
    <View style={[styles.row, { backgroundColor: getMinuteColor(item) }]}>
      <Text style={styles.rowTime}>{formatTime(item.t)}</Text>
      <Text style={styles.rowDetail}>
        ok:{item.ok} fail:{item.fail} buf:{item.buf} thr:{item.thr} flt:{item.flt}
        {item.flt > 0 ? ` [a:${item.flt_acc ?? 0} d:${item.flt_dup ?? 0} s:${item.flt_stale ?? 0}]` : ""}{" "}
        cb:{item.cb}
      </Text>
    </View>
  );
}

function EventRow({ item }: { item: EventEntry }) {
  return (
    <View style={[styles.row, { backgroundColor: getEventColor(item) }]}>
      <Text style={styles.rowTime}>{formatTimeSeconds(item.t)}</Text>
      <Text style={styles.rowDetail}>
        {item.e.toUpperCase()}
        {item.d ? ` ${item.d}` : ""}
      </Text>
    </View>
  );
}

export default function DiagnosticsScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [trackingActive, setTrackingActive] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const next = await getLog();
          if (active) setEntries(next);
          const tracking = await isTracking();
          if (active) setTrackingActive(tracking);
        } catch {
          // Non-critical — screen shows stale or empty data
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const handleToggleTracking = async () => {
    setTrackingLoading(true);
    try {
      if (trackingActive) {
        await stopTracking();
        setTrackingActive(false);
      } else {
        await startTracking();
        setTrackingActive(true);
      }
    } catch (err) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao alterar rastreamento",
      );
    } finally {
      setTrackingLoading(false);
    }
  };

  const reversed = [...entries].reverse();

  const handleShare = async () => {
    if (entries.length === 0) {
      Alert.alert("No data", "No diagnostic data to share.");
      return;
    }
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `caab-tracker-log-${date}.json`);
      file.write(JSON.stringify(entries, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } catch {
      Alert.alert("Share failed", "Could not export diagnostic log.");
    }
  };

  const handleClear = () => {
    Alert.alert("Clear Log", "Remove all diagnostic data?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearLog();
          setEntries([]);
        },
      },
    ]);
  };

  if (entries.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No diagnostic data</Text>
        <Text style={styles.emptyText}>
          Data will appear here once tracking starts.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* T048: Manual tracking toggle for support */}
      <View style={styles.trackingControl}>
        <View>
          <Text style={styles.trackingLabel}>Controle de suporte — uso emergencial</Text>
          <Text style={styles.trackingStatus}>
            Rastreamento: {trackingActive ? "Ativo" : "Inativo"}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.trackingButton,
            trackingActive ? styles.trackingStop : styles.trackingStart,
          ]}
          onPress={handleToggleTracking}
          disabled={trackingLoading}
        >
          {trackingLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.trackingButtonText}>
              {trackingActive ? "Parar" : "Iniciar"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <SummaryBar entries={entries} />
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Text style={styles.actionText}>Share Log</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={handleClear}
        >
          <Text style={[styles.actionText, styles.clearText]}>Clear Log</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={reversed}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) =>
          item.type === "summary" ? (
            <MinuteRow item={item} />
          ) : (
            <EventRow item={item} />
          )
        }
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  summaryBar: {
    padding: 12,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  summaryItem: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  summaryOk: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
  },
  summaryFail: {
    backgroundColor: "#fecaca",
    color: "#dc2626",
  },
  summaryBuf: {
    backgroundColor: "#fef3c7",
    color: "#a16207",
  },
  summaryThr: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  summaryFlt: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  clearButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dc2626",
  },
  clearText: {
    color: "#dc2626",
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    alignItems: "center",
  },
  rowTime: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    width: 70,
  },
  rowDetail: {
    fontSize: 13,
    color: "#475569",
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  trackingControl: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fef3c7",
    borderBottomWidth: 1,
    borderBottomColor: "#fcd34d",
  },
  trackingLabel: {
    fontSize: 11,
    color: "#92400e",
    fontWeight: "600",
  },
  trackingStatus: {
    fontSize: 13,
    color: "#78350f",
    fontWeight: "500",
    marginTop: 2,
  },
  trackingButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 72,
    alignItems: "center",
  },
  trackingStart: {
    backgroundColor: "#2563eb",
  },
  trackingStop: {
    backgroundColor: "#dc2626",
  },
  trackingButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
