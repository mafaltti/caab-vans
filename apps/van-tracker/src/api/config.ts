import type { DeviceProvisioning, TrackerConfig } from "@/types";
import {
  setGeofenceRegions,
  setGeofenceConfigVersion,
} from "@/storage/tracking-state";

const REQUEST_TIMEOUT = 10_000;

export async function fetchTrackerConfig(
  settings: DeviceProvisioning,
): Promise<TrackerConfig | null> {
  const url = `${settings.apiBaseUrl}/api/tracker-config/${settings.vanId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "x-ingestion-token": settings.ingestionToken },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[CAAB Tracker] Config fetch failed: HTTP ${response.status}`);
      return null;
    }

    const config = (await response.json()) as TrackerConfig;

    await setGeofenceRegions(config.geofenceRegions);
    await setGeofenceConfigVersion(config.configVersion);

    return config;
  } catch (err) {
    console.warn(
      "[CAAB Tracker] Config fetch error:",
      err instanceof Error ? err.message : "unknown",
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
