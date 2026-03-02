export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  ts: number;
}

export interface Settings {
  apiBaseUrl: string;
  vanId: string;
  ingestionToken: string;
}

export interface TrackingStatus {
  isTracking: boolean;
  lastSentAt: number | null;
  lastLat: number | null;
  lastLng: number | null;
  lastError: string | null;
}
