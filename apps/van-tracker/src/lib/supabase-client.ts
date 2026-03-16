import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "";

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function signIn(
  email: string,
  password: string,
): Promise<{ userId: string; email: string; role: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = data.user;
  const role = user.app_metadata?.role as string | undefined;
  const isActive = user.app_metadata?.is_active as boolean | undefined;

  if (!role || role !== "driver") {
    await supabase.auth.signOut();
    throw new Error("Acesso negado. Apenas motoristas podem entrar.");
  }

  if (isActive === false) {
    await supabase.auth.signOut();
    throw new Error("Conta desativada. Entre em contato com o suporte.");
  }

  return {
    userId: user.id,
    email: user.email!,
    role,
  };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(
  callback: (event: string, session: unknown) => void,
) {
  return supabase.auth.onAuthStateChange(callback);
}
