import { LocationPoint, Settings } from "@/types";

export type SendResult =
  | {
      success: true;
      serverTs: number;
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

  const body = {
    deviceId,
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    speed: point.speed,
    heading: point.heading,
    ts: point.ts,
    seq: point.seq,
    bufferSize: point.bufferSize,
    failureCount: point.failureCount,
    batteryLevel: point.batteryLevel,
    networkType: point.networkType,
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
      seq: p.seq,
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
