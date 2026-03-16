import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { DeviceProvisioning } from "@/types";

const SETTINGS_KEY = "@settings";
const TOKEN_SECURE_KEY = "ingestionToken";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSettings(): Promise<DeviceProvisioning | null> {
  const json = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!json) return null;
  try {
    const stored = JSON.parse(json) as Partial<DeviceProvisioning>;

    // Read token from SecureStore
    let token = await SecureStore.getItemAsync(TOKEN_SECURE_KEY);

    // Migration: if token in AsyncStorage but not in SecureStore
    if (!token && stored.ingestionToken) {
      try {
        await SecureStore.setItemAsync(TOKEN_SECURE_KEY, stored.ingestionToken);
        // Only remove from AsyncStorage after successful SecureStore write
        const { ingestionToken: _token, ...rest } = stored;
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
      } catch {
        // SecureStore failed — keep token in AsyncStorage as fallback
      }
      token = stored.ingestionToken;
    }

    if (!stored.apiBaseUrl || !stored.vanId || !token) return null;

    return {
      apiBaseUrl: stored.apiBaseUrl,
      vanId: stored.vanId,
      ingestionToken: token,
    };
  } catch {
    await AsyncStorage.removeItem(SETTINGS_KEY);
    return null;
  }
}

export async function saveSettings(settings: DeviceProvisioning): Promise<void> {
  if (!UUID_REGEX.test(settings.vanId)) {
    throw new Error(`Invalid vanId: must be UUID format`);
  }
  // Store token in SecureStore
  await SecureStore.setItemAsync(TOKEN_SECURE_KEY, settings.ingestionToken);
  // Store non-sensitive fields in AsyncStorage (without token)
  const { ingestionToken: _token, ...rest } = settings;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
}

export async function isSettingsComplete(): Promise<boolean> {
  const settings = await getSettings();
  if (!settings) return false;
  return Boolean(
    settings.apiBaseUrl &&
    typeof settings.apiBaseUrl === "string" &&
    settings.vanId &&
    typeof settings.vanId === "string" &&
    settings.ingestionToken &&
    typeof settings.ingestionToken === "string",
  );
}
