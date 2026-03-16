import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { signIn } from "@/lib/supabase-client";
import { saveDriverSession } from "@/storage/driver-session";
import { isShiftActive, getShiftState } from "@/storage/shift-state";
import { stopTracking } from "@/location/tracking";
import { clearShiftState } from "@/storage/shift-state";
import { fetchWithDriverAuth } from "@/lib/driver-api";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Preencha e-mail e senha.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // FR-024: Auto-end previous shift on new sign-in
      const shiftActive = await isShiftActive();
      if (shiftActive) {
        const state = await getShiftState();
        if (state.activeRouteId) {
          try {
            await fetchWithDriverAuth(
              `/api/routes/${state.activeRouteId}/end`,
              { method: "POST" },
            );
          } catch {
            // Force clear if server call fails
          }
          try {
            await stopTracking();
          } catch {
            // Non-fatal
          }
          await clearShiftState();
        }
      }

      const result = await signIn(email, password);

      await saveDriverSession({
        userId: result.userId,
        email: result.email,
        role: "driver",
      });

      router.replace("/(driver)");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao entrar. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>CAAB Motorista</Text>
        <Text style={styles.subtitle}>Entre com suas credenciais</Text>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="motorista@caab.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Sua senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#999"
          />
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 32,
  },
  fieldContainer: {
    marginBottom: 16,
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
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
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
