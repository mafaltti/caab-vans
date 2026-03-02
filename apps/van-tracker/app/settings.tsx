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
import { getSettings, saveSettings } from "@/storage/settings";

export default function SettingsScreen() {
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [vanId, setVanId] = useState("");
  const [ingestionToken, setIngestionToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vanIdError, setVanIdError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await getSettings();
      if (settings) {
        setApiBaseUrl(settings.apiBaseUrl);
        setVanId(settings.vanId);
        setIngestionToken(settings.ingestionToken);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Clear previous messages
    setVanIdError("");
    setFormError("");
    setSuccessMessage("");

    setSaving(true);
    try {
      await saveSettings({
        apiBaseUrl,
        vanId,
        ingestionToken,
      });
      setSuccessMessage("Settings saved");
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("vanId")) {
        setVanIdError(errorMessage);
      } else {
        setFormError(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* API Base URL */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>API Base URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://api.example.com"
          value={apiBaseUrl}
          onChangeText={setApiBaseUrl}
          placeholderTextColor="#999"
        />
      </View>

      {/* Van ID */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Van ID</Text>
        <TextInput
          style={[styles.input, vanIdError && styles.inputError]}
          placeholder="550e8400-e29b-41d4-a716-446655440000"
          value={vanId}
          onChangeText={setVanId}
          placeholderTextColor="#999"
        />
        {vanIdError && <Text style={styles.errorText}>{vanIdError}</Text>}
      </View>

      {/* Ingestion Token */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Ingestion Token</Text>
        <TextInput
          style={styles.input}
          placeholder="your-token-here"
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

      {/* Success Message */}
      {successMessage && (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
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
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#1f2937",
  },
  inputError: {
    borderColor: "#dc2626",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 6,
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  successContainer: {
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: "#15803d",
    fontSize: 14,
    fontWeight: "500",
  },
});
