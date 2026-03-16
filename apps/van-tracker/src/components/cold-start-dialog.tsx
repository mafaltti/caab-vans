import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface ColdStartStop {
  stopId: string;
  stopName: string;
  arrivalTime: string;
  distanceM: number | null;
}

interface ColdStartDialogProps {
  visible: boolean;
  suggestedStopId: string;
  suggestedStopName: string;
  alternatives: ColdStartStop[];
  onConfirm: (stopId: string) => Promise<void>;
  onClose: () => void;
}

export function ColdStartDialog({
  visible,
  suggestedStopId,
  suggestedStopName,
  alternatives,
  onConfirm,
  onClose,
}: ColdStartDialogProps) {
  const [selectedId, setSelectedId] = useState(suggestedStopId);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(selectedId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Início tardio</Text>
          <Text style={styles.subtitle}>
            A rota já deveria ter começado. Confirme a parada de partida.
          </Text>

          <Text style={styles.suggested}>
            Sugestão: {suggestedStopName}
          </Text>

          {alternatives.length > 0 && (
            <View style={styles.alternatives}>
              {alternatives.map((stop) => (
                <TouchableOpacity
                  key={stop.stopId}
                  style={[
                    styles.radioItem,
                    selectedId === stop.stopId && styles.radioSelected,
                  ]}
                  onPress={() => setSelectedId(stop.stopId)}
                >
                  <View style={styles.radio}>
                    {selectedId === stop.stopId && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopName}>{stop.stopName}</Text>
                    <Text style={styles.stopDetail}>
                      {stop.arrivalTime}
                      {stop.distanceM
                        ? ` · ${(stop.distanceM / 1000).toFixed(1)} km`
                        : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmButton, submitting && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmText}>Confirmar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 16,
  },
  suggested: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
    marginBottom: 12,
  },
  alternatives: {
    marginBottom: 16,
  },
  radioItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  radioSelected: {
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  stopDetail: {
    fontSize: 12,
    color: "#64748b",
  },
  confirmButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
