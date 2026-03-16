// ---------------------------------------------------------------------------
// Driver-specific types for the native driver app.
// Mirrors the API contracts from the Next.js BFF layer.
// ---------------------------------------------------------------------------

// ---- Reason codes --------------------------------------------------------

export type SkipReasonCode =
  | "road_closure"
  | "no_passengers"
  | "facility_closed"
  | "vehicle_issue"
  | "other";

export type DetourReasonCode =
  | "road_closure"
  | "accident"
  | "construction"
  | "flooding"
  | "police_checkpoint"
  | "other";

// ---- Route list (GET /api/driver/routes) ---------------------------------

export interface DriverRoute {
  id: string;
  name: string;
  vanName: string;
  totalStops: number;
  firstStopTime: string | null;
  lastStopTime: string | null;
  runStatus: "waiting" | "in_progress" | "completed" | "no_run";
  run: { id: string; serviceDate: string } | null;
  activeShift: { id: string; driverId: string; startedAt: string } | null;
  todayShifts: {
    id: string;
    driverId: string;
    driverEmail: string;
    startedAt: string;
    endedAt: string | null;
  }[];
  hasSkippedStops: boolean;
  isDetourActive: boolean;
}

// ---- Route detail (GET /api/driver/routes/[routeId]) ---------------------

export interface RouteDetailStop {
  id: string;
  stopName: string;
  arrivalTime: string;
  departureTime: string;
  stopSequence: number;
  stopLat: number | null;
  stopLng: number | null;
  status: "pending" | "passed" | "skipped" | null;
  passedAt: string | null;
  reasonCode: string | null;
  note: string | null;
}

export interface TrackerHealthInfo {
  lastPingAt: string | null;
  minutesSinceLastPing: number | null;
  batteryLevel: number | null;
  networkType: string | null;
  bufferSize: number | null;
  failureCount: number | null;
  isStale: boolean;
  isLowBattery: boolean;
}

export interface RouteProgress {
  runId: string;
  runStatus: "waiting" | "in_progress" | "completed";
  nextStopId: string | null;
  lastPassedStopId: string | null;
  passedCount: number;
  totalStops: number;
  nextStopEta: string | null;
  delayMinutes: number | null;
  isDetourActive: boolean;
  detourReasonCode: string | null;
  detourNote: string | null;
  hasSkippedStops: boolean;
}

export interface RouteDetail {
  id: string;
  name: string;
  isRunning: boolean;
  trackingStatus: "live" | "stale" | "offline";
  isTrackingFresh: boolean;
  scheduleStatus: "not_started" | "active" | "ended";
  totalStops: number;
  currentStopIndex: number | null;
  progress: RouteProgress | null;
  schedule: RouteDetailStop[];
  van: {
    id: string;
    lastLat: number | null;
    lastLng: number | null;
    lastGpsFixAt: string | null;
    isLocationOutdated: boolean;
  };
  trackerHealth: TrackerHealthInfo | null;
}

// ---- Local storage types -------------------------------------------------

export interface ShiftState {
  shiftActive: boolean;
  activeRouteId: string | null;
  activeShiftId: string | null;
}

export interface DriverSession {
  userId: string;
  email: string;
  role: "driver";
}

export interface DeviceProvisioning {
  apiBaseUrl: string;
  vanId: string;
  ingestionToken: string;
}

// ---- API response wrappers -----------------------------------------------

export interface RoutesListResponse {
  routes: DriverRoute[];
  serverTime: string;
  userId: string;
}

export interface RouteDetailResponse {
  route: RouteDetail;
  serverTime: string;
}

export interface StartShiftResponse {
  shift: {
    id: string;
    runId: string;
    driverId: string;
    startedAt: string;
    endedAt: string | null;
  };
  run: { id: string; routeId: string; serviceDate: string };
  coldStart?: {
    suggestedStopId: string;
    suggestedStopName: string;
    alternatives: {
      stopId: string;
      stopName: string;
      arrivalTime: string;
      distanceM: number | null;
    }[];
  };
}

export interface EndShiftResponse {
  shift: {
    id: string;
    runId: string;
    driverId: string;
    startedAt: string;
    endedAt: string;
  };
  run: { id: string; routeId: string; serviceDate: string };
}

export interface ConfirmStartStopResponse {
  confirmed: boolean;
  nextStopId: string | null;
  lastPassedStopId: string | null;
  passedCount: number;
}

export interface SkipStopResponse {
  skipped: boolean;
  stop: {
    scheduleEntryId: string;
    stopName: string;
    status: "skipped";
    reasonCode: string;
    note: string | null;
    actedBy: string;
    actedAt: string;
  };
  progress: {
    nextStopId: string | null;
    lastPassedStopId: string | null;
    hasSkippedStops: boolean;
  };
  event: { id: string; eventType: string; createdAt: string } | null;
}

export interface DetourResponse {
  detour: {
    active: boolean;
    reasonCode?: string | null;
    note?: string | null;
    startedAt?: string;
    startedBy?: string;
    endedAt?: string;
    endedBy?: string;
  };
  event: { id: string; eventType: string; createdAt: string } | null;
}
