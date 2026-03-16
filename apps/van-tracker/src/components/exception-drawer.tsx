import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import type { RouteDetailStop } from "@/types/driver";

type DrawerMode = "menu" | "skip" | "detour";

interface ExceptionDrawerProps {
  visible: boolean;
  onClose: () => void;
  nextStop: RouteDetailStop | null;
  isDetourActive: boolean;
  onSkipStop: (reasonCode: string, note?: string) => Promise<void>;
  onDetourToggle: (
    action: "start" | "end",
    reasonCode?: string,
    note?: string,
  ) => Promise<void>;
}

const SKIP_REASONS = [
  { code: "road_closure", label: "Via interditada" },
  { code: "no_passengers", label: "Sem passageiros" },
  { code: "facility_closed", label: "Local fechado" },
  { code: "vehicle_issue", label: "Problema no veículo" },
  { code: "other", label: "Outro" },
];

const DETOUR_REASONS = [
  { code: "road_closure", label: "Via interditada" },
  { code: "accident", label: "Acidente" },
  { code: "construction", label: "Obra" },
  { code: "flooding", label: "Alagamento" },
  { code: "police_checkpoint", label: "Blitz policial" },
  { code: "other", label: "Outro" },
];

export function ExceptionDrawer({
  visible,
  onClose,
  nextStop,
  isDetourActive,
  onSkipStop,
  onDetourToggle,
}: ExceptionDrawerProps) {
  const [mode, setMode] = useState<DrawerMode>("menu");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetState = () => {
    setMode("menu");
    setSelectedReason(null);
    setNote("");
    setSubmitting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleNavigate = () => {
    if (!nextStop?.stopLat || !nextStop?.stopLng) {
      Alert.alert("Sem coordenadas", "Esta parada não tem coordenadas cadastradas.");
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${nextStop.stopLat},${nextStop.stopLng}&travelmode=driving`;
    Linking.openURL(url);
    handleClose();
  };

  const handleSkipSubmit = async () => {
    if (!selectedReason) return;
    if (selectedReason === "other" && !note.trim()) {
      Alert.alert("Nota obrigatória", "Informe o motivo ao selecionar 'Outro'.");
      return;
    }
    setSubmitting(true);
    try {
      await onSkipStop(selectedReason, note.trim() || undefined);
      handleClose();
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao pular parada");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetourSubmit = async () => {
    if (isDetourActive) {
      setSubmitting(true);
      try {
        await onDetourToggle("end");
        handleClose();
      } catch (err) {
        Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao encerrar desvio");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selectedReason) return;
    if (selectedReason === "other" && !note.trim()) {
      Alert.alert("Nota obrigatória", "Informe o motivo ao selecionar 'Outro'.");
      return;
    }
    setSubmitting(true);
    try {
      await onDetourToggle("start", selectedReason, note.trim() || undefined);
      handleClose();
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao iniciar desvio");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {mode === "menu" && (
            <View>
              <Text style={styles.title}>Ações</Text>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleNavigate}
                disabled={!nextStop?.stopLat}
              >
                <Text style={[styles.menuText, !nextStop?.stopLat && styles.menuDisabled]}>
                  Navegar até a parada
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setMode("skip")}
                disabled={!nextStop}
              >
                <Text style={[styles.menuText, !nextStop && styles.menuDisabled]}>
                  Pular próxima parada
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (isDetourActive) {
                    handleDetourSubmit();
                  } else {
                    setMode("detour");
                  }
                }}
              >
                <Text style={styles.menuText}>
                  {isDetourActive ? "Sair do desvio" : "Entrar no desvio"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === "skip" && (
            <ScrollView>
              <Text style={styles.title}>Pular parada</Text>
              <Text style={styles.subtitle}>
                {nextStop?.stopName ?? "Próxima parada"}
              </Text>

              {SKIP_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.code}
                  style={[
                    styles.radioItem,
                    selectedReason === r.code && styles.radioSelected,
                  ]}
                  onPress={() => setSelectedReason(r.code)}
                >
                  <View style={styles.radio}>
                    {selectedReason === r.code && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}

              {(selectedReason === "other" || note.length > 0) && (
                <TextInput
                  style={styles.noteInput}
                  placeholder="Descreva o motivo..."
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, 500))}
                  multiline
                  maxLength={500}
                  placeholderTextColor="#999"
                />
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.backButton} onPress={() => { setMode("menu"); setSelectedReason(null); setNote(""); }}>
                  <Text style={styles.backText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, (!selectedReason || submitting) && styles.buttonDisabled]}
                  onPress={handleSkipSubmit}
                  disabled={!selectedReason || submitting}
                >
                  <Text style={styles.confirmText}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {mode === "detour" && (
            <ScrollView>
              <Text style={styles.title}>Iniciar desvio</Text>

              {DETOUR_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.code}
                  style={[
                    styles.radioItem,
                    selectedReason === r.code && styles.radioSelected,
                  ]}
                  onPress={() => setSelectedReason(r.code)}
                >
                  <View style={styles.radio}>
                    {selectedReason === r.code && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}

              {(selectedReason === "other" || note.length > 0) && (
                <TextInput
                  style={styles.noteInput}
                  placeholder="Descreva o motivo..."
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, 500))}
                  multiline
                  maxLength={500}
                  placeholderTextColor="#999"
                />
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.backButton} onPress={() => { setMode("menu"); setSelectedReason(null); setNote(""); }}>
                  <Text style={styles.backText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, (!selectedReason || submitting) && styles.buttonDisabled]}
                  onPress={handleDetourSubmit}
                  disabled={!selectedReason || submitting}
                >
                  <Text style={styles.confirmText}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 16,
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
  menuItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  menuText: {
    fontSize: 16,
    color: "#0f172a",
  },
  menuDisabled: {
    color: "#d1d5db",
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "500",
  },
  radioItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
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
  radioLabel: {
    fontSize: 15,
    color: "#0f172a",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#1f2937",
    minHeight: 80,
    textAlignVertical: "top",
    marginTop: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
  },
  backText: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
  },
  confirmText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
