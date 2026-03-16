import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { getSettings, saveSettings } from "@/storage/settings";

export default function DeviceSetupScreen() {
  const router = useRouter();
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [vanId, setVanId] = useState("");
  const [ingestionToken, setIngestionToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vanIdError, setVanIdError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        if (settings) {
          setApiBaseUrl(settings.apiBaseUrl);
          setVanId(settings.vanId);
          setIngestionToken(settings.ingestionToken);
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setVanIdError("");
    setFormError("");
    setSaving(true);
    try {
      await saveSettings({ apiBaseUrl, vanId, ingestionToken });
      router.replace("/login");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      if (msg.includes("vanId")) {
        setVanIdError(msg);
      } else {
        setFormError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Configuração do Dispositivo</Text>
      <Text style={styles.subtitle}>
        Configure os dados de conexão para este dispositivo.
      </Text>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>URL da API</Text>
        <TextInput
          style={styles.input}
          placeholder="https://vans.example.com"
          value={apiBaseUrl}
          onChangeText={setApiBaseUrl}
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>ID da Van</Text>
        <TextInput
          style={[styles.input, vanIdError && styles.inputError]}
          placeholder="550e8400-e29b-41d4-a716-446655440000"
          value={vanId}
          onChangeText={setVanId}
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
        {vanIdError ? <Text style={styles.errorText}>{vanIdError}</Text> : null}
      </View>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Token de Ingestão</Text>
        <TextInput
          style={styles.input}
          placeholder="Token do dispositivo"
          value={ingestionToken}
          onChangeText={setIngestionToken}
          secureTextEntry
          placeholderTextColor="#999"
        />
      </View>

      {formError ? (
        <View style={styles.formErrorContainer}>
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Salvar e Continuar</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 24,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#1f2937",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#1f2937",
    backgroundColor: "#fff",
  },
  inputError: {
    borderColor: "#dc2626",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 6,
  },
  formErrorContainer: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  formErrorText: {
    color: "#dc2626",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
