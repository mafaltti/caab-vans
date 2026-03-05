import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationPoint } from "@/types";

const BUFFER_KEY = "@locationBuffer";
const MAX_BUFFER_SIZE = 50;

export async function getBuffer(): Promise<LocationPoint[]> {
  try {
    const data = await AsyncStorage.getItem(BUFFER_KEY);
    if (!data) {
      return [];
    }
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function addToBuffer(point: LocationPoint): Promise<void> {
  const buffer = await getBuffer();
  // Consecutive dedup — skip if identical to last buffered point
  if (buffer.length > 0) {
    const last = buffer[buffer.length - 1];
    if (last.lat === point.lat && last.lng === point.lng && last.ts === point.ts) {
      return;
    }
  }
  buffer.push(point);

  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }

  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
}

export async function removeFromBuffer(count: number): Promise<void> {
  const buffer = await getBuffer();
  buffer.splice(0, count);
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
}

export async function clearBuffer(): Promise<void> {
  await AsyncStorage.removeItem(BUFFER_KEY);
}
