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
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingestion-token": settings.ingestionToken,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const responseBody = await response.json();
      return {
        success: true,
        serverTs: responseBody.ts,
      };
    }

    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 404 ||
      response.status === 429
    ) {
      const errorBody = await response.json();
      return {
        success: false,
        code: errorBody.error.code,
        message: errorBody.error.message,
        status: response.status,
      };
    }

    // For any other status, treat it as an error
    const errorBody = await response.json();
    return {
      success: false,
      code: errorBody.error?.code || "UNKNOWN_ERROR",
      message: errorBody.error?.message || "Unknown error",
      status: response.status,
    };
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : "Unknown network error",
    );
  }
}
