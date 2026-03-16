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

export async function setShiftActiveDeviceProtected(
  active: boolean,
  routeId: string | null,
): Promise<void> {
  if (Platform.OS !== "android" || !DeviceProtectedStorage) return;
  try {
    await DeviceProtectedStorage.setShiftActive(active, routeId);
  } catch {
    // Best-effort
  }
}

export async function getShiftActiveDeviceProtected(): Promise<boolean> {
  if (Platform.OS !== "android" || !DeviceProtectedStorage) return false;
  try {
    return await DeviceProtectedStorage.getShiftActive();
  } catch {
    return false;
  }
}

export async function getActiveRouteIdDeviceProtected(): Promise<string | null> {
  if (Platform.OS !== "android" || !DeviceProtectedStorage) return null;
  try {
    return await DeviceProtectedStorage.getActiveRouteId();
  } catch {
    return null;
  }
}
