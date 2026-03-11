import { LocationPoint, Settings } from "@/types";
import {
  getGeofenceEventBuffer,
  removeGeofenceEvents,
  getGeofenceConfigVersion,
} from "@/storage/tracking-state";
import { fetchTrackerConfig } from "@/api/config";
import { registerGeofencesFromCache } from "@/location/tracking";

export type SendResult =
  | {
      success: true;
      serverTs: number;
      processedEventIds?: string[];
      configVersion?: string;
    }
  | {
      success: false;
      code: string;
      message: string;
      status?: number;
    };

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

const REQUEST_TIMEOUT = 10000; // 10 seconds

async function safeJsonParse(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function sendLocationPing(
  settings: Settings,
  deviceId: string,
  point: LocationPoint,
): Promise<SendResult> {
  const url = `${settings.apiBaseUrl}/api/tracking/${settings.vanId}`;

  // Drain geofence event buffer to piggyback on ping
  let geofenceEvents: { placeId: string; enteredAt: number; eventId: string }[] = [];
  try {
    geofenceEvents = await getGeofenceEventBuffer();
  } catch {
    // Non-fatal — send ping without events
  }

  const body: Record<string, unknown> = {
    deviceId,
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    speed: point.speed,
    heading: point.heading,
    ts: point.ts,
    bufferSize: point.bufferSize,
    failureCount: point.failureCount,
    batteryLevel: point.batteryLevel,
    networkType: point.networkType,
  };

  if (geofenceEvents.length > 0) {
    body.geofenceEvents = geofenceEvents;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingestion-token": settings.ingestionToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok) {
      const responseBody = await safeJsonParse(response);

      // Clear only confirmed events from buffer
      const processedEventIds = responseBody?.processedEventIds as string[] | undefined;
      if (processedEventIds && processedEventIds.length > 0) {
        try {
          await removeGeofenceEvents(processedEventIds);
        } catch {
          // Non-fatal
        }
      }

      // Check for config version mismatch (resync trigger).
      // Don't update cached version here — fetchTrackerConfig does it on
      // success, so a failed fetch leaves the mismatch in place for retry.
      const configVersion = responseBody?.configVersion as string | undefined;
      if (configVersion) {
        try {
          const cached = await getGeofenceConfigVersion();
          if (cached !== configVersion) {
            fetchTrackerConfig(settings)
              .then(() => registerGeofencesFromCache())
              .catch(() => {});
          }
        } catch {
          // Non-fatal
        }
      }

      return {
        success: true,
        serverTs: (responseBody?.ts as number) ?? Date.now(),
        processedEventIds,
        configVersion,
      };
    }

    const errorBody = await safeJsonParse(response);
    const error = errorBody?.error as Record<string, unknown> | undefined;

    return {
      success: false,
      code: (error?.code as string) ?? "UNKNOWN_ERROR",
      message: (error?.message as string) ?? `HTTP ${response.status}`,
      status: response.status,
    };
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : "Unknown network error",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export type BatchSendResult =
  | {
      success: true;
      received: number;
      duplicates: number;
      serverTs: number;
    }
  | {
      success: false;
      code: string;
      message: string;
      status?: number;
    };

export async function sendBatchPing(
  settings: Settings,
  deviceId: string,
  points: LocationPoint[],
): Promise<BatchSendResult> {
  // Same URL pattern but tracking-batch
  const url = `${settings.apiBaseUrl}/api/tracking-batch/${settings.vanId}`;

  const body = {
    points: points.map((p) => ({
      deviceId,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      speed: p.speed,
      heading: p.heading,
      ts: p.ts,
      bufferSize: p.bufferSize,
      failureCount: p.failureCount,
      batteryLevel: p.batteryLevel,
      networkType: p.networkType,
    })),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingestion-token": settings.ingestionToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok) {
      const responseBody = await safeJsonParse(response);
      return {
        success: true,
        received: (responseBody?.received as number) ?? points.length,
        duplicates: (responseBody?.duplicates as number) ?? 0,
        serverTs: (responseBody?.ts as number) ?? Date.now(),
      };
    }

    const errorBody = await safeJsonParse(response);
    const error = errorBody?.error as Record<string, unknown> | undefined;

    return {
      success: false,
      code: (error?.code as string) ?? "UNKNOWN_ERROR",
      message: (error?.message as string) ?? `HTTP ${response.status}`,
      status: response.status,
    };
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : "Unknown network error",
    );
  } finally {
    clearTimeout(timeout);
  }
}
