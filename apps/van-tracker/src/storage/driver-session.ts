import AsyncStorage from "@react-native-async-storage/async-storage";

interface DriverSessionData {
  userId: string;
  email: string;
  role: "driver";
}

const SESSION_KEY = "@driverSession";

export async function getDriverSession(): Promise<DriverSessionData | null> {
  const json = await AsyncStorage.getItem(SESSION_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json) as DriverSessionData;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function saveDriverSession(
  session: DriverSessionData,
): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearDriverSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function hasDriverSession(): Promise<boolean> {
  const session = await getDriverSession();
  return session !== null;
}
