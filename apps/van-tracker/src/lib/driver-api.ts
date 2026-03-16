import { getSettings } from "@/storage/settings";
import { getSession, supabase } from "@/lib/supabase-client";

export async function fetchWithDriverAuth(
  path: string,
  options?: { method?: string; body?: object },
): Promise<Response> {
  const settings = await getSettings();
  if (!settings) {
    throw new Error("Device not provisioned");
  }

  const session = await getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const url = `${settings.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    "x-bound-van-id": settings.vanId,
    "x-ingestion-token": settings.ingestionToken,
  };

  const fetchOptions: RequestInit = {
    method: options?.method ?? "GET",
    headers,
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  let response = await fetch(url, fetchOptions);

  // Retry once on 401 after token refresh
  if (response.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
      response = await fetch(url, { ...fetchOptions, headers });
    }
  }

  return response;
}
