import AsyncStorage from "@react-native-async-storage/async-storage";

export async function getTrackingEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem("@trackingEnabled");
  return value === "true";
}

export async function setTrackingEnabled(flag: boolean): Promise<void> {
  await AsyncStorage.setItem("@trackingEnabled", String(flag));
}

export async function getLastSentAt(): Promise<number | null> {
  const value = await AsyncStorage.getItem("@lastSentAt");
  if (value === null) return null;
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

export async function setLastSentAt(ts: number): Promise<void> {
  await AsyncStorage.setItem("@lastSentAt", String(ts));
}

export async function getLastTaskInvocationAt(): Promise<number | null> {
  const value = await AsyncStorage.getItem("@lastTaskInvocationAt");
  if (value === null) return null;
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

export async function getAuthPaused(): Promise<boolean> {
  const value = await AsyncStorage.getItem("@authPaused");
  return value === "true";
}
