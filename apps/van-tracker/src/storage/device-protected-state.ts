import { NativeModules, Platform } from "react-native";

const { DeviceProtectedStorage } = NativeModules;

export async function setTrackingEnabledDeviceProtected(
  flag: boolean,
): Promise<void> {
  if (Platform.OS !== "android" || !DeviceProtectedStorage) return;
  try {
    await DeviceProtectedStorage.setTracking(flag);
  } catch {
    // Graceful fallback — device-protected storage is best-effort
  }
}

export async function getTrackingEnabledDeviceProtected(): Promise<boolean> {
  if (Platform.OS !== "android" || !DeviceProtectedStorage) return false;
  try {
    return await DeviceProtectedStorage.getTracking();
  } catch {
    return false;
  }
}

let migrated = false;

export async function syncTrackingStateToDeviceProtected(
  wasTracking: boolean,
): Promise<void> {
  if (migrated) return;
  migrated = true;
  await setTrackingEnabledDeviceProtected(wasTracking);
}

export async function consumeBootTrigger(): Promise<string | null> {
  if (Platform.OS !== "android" || !DeviceProtectedStorage) return null;
  try {
    return await DeviceProtectedStorage.consumeBootTrigger();
  } catch {
    return null;
  }
}
