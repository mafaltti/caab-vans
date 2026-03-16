import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationPoint } from "@/types";

const BUFFER_KEY = "@locationBuffer";
const MAX_BUFFER_SIZE = 500;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Simple async mutex to prevent concurrent read-modify-write corruption
let mutexPromise: Promise<void> = Promise.resolve();

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutexPromise.then(fn, fn);
  mutexPromise = result.then(() => {}, () => {});
  return result;
}

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

export async function getBufferSize(): Promise<number> {
  const buffer = await getBuffer();
  return buffer.length;
}

export async function addToBuffer(point: LocationPoint): Promise<void> {
  return withMutex(async () => {
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
  });
}

export async function removeFromBuffer(count: number): Promise<void> {
  return withMutex(async () => {
    const buffer = await getBuffer();
    buffer.splice(0, count);
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  });
}

export function filterExpiredPoints(points: LocationPoint[]): LocationPoint[] {
  const cutoff = Date.now() - TTL_MS;
  return points.filter((p) => p.ts >= cutoff);
}

