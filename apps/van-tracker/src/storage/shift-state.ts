import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

const { DeviceProtectedStorage } = NativeModules;

const SHIFT_KEY = "@shiftState";

interface ShiftStateData {
  shiftActive: boolean;
  activeRouteId: string | null;
  activeShiftId: string | null;
}

const DEFAULT_STATE: ShiftStateData = {
  shiftActive: false,
  activeRouteId: null,
  activeShiftId: null,
};

export async function getShiftState(): Promise<ShiftStateData> {
  const json = await AsyncStorage.getItem(SHIFT_KEY);
  if (!json) return DEFAULT_STATE;
  try {
    return JSON.parse(json) as ShiftStateData;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function setShiftActive(
  routeId: string,
  shiftId: string,
): Promise<void> {
  const state: ShiftStateData = {
    shiftActive: true,
    activeRouteId: routeId,
    activeShiftId: shiftId,
  };
  await AsyncStorage.setItem(SHIFT_KEY, JSON.stringify(state));

  // Dual-write to device-protected storage for reboot resilience
  if (Platform.OS === "android" && DeviceProtectedStorage) {
    try {
      await DeviceProtectedStorage.setShiftActive(true, routeId);
    } catch {
      // Best-effort — device-protected storage is non-critical
    }
  }
}

export async function clearShiftState(): Promise<void> {
  await AsyncStorage.removeItem(SHIFT_KEY);

  // Clear device-protected storage
  if (Platform.OS === "android" && DeviceProtectedStorage) {
    try {
      await DeviceProtectedStorage.setShiftActive(false, null);
    } catch {
      // Best-effort
    }
  }
}

export async function isShiftActive(): Promise<boolean> {
  const state = await getShiftState();
  return state.shiftActive;
}
