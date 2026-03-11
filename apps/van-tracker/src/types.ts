export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  ts: number;
  bufferSize?: number | null;
  failureCount?: number | null;
  batteryLevel?: number | null;
  networkType?: string | null;
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

export interface GeofenceRegion {
  placeId: string;
  lat: number;
  lng: number;
  radius: number;
}

export interface GeofenceEvent {
  placeId: string;
  enteredAt: number;
  eventId: string;
}

export interface TrackerConfig {
  geofenceRegions: GeofenceRegion[];
  configVersion: string;
}
