import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";

const DEVICE_ID_KEY = "@deviceId";

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const newId = randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
  return newId;
}
