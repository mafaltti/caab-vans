import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Settings } from "@/types";

const SETTINGS_KEY = "@settings";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSettings(): Promise<Settings | null> {
  const json = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!json) return null;
  return JSON.parse(json) as Settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!UUID_REGEX.test(settings.vanId)) {
    throw new Error(`Invalid vanId: must be UUID format`);
  }
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
