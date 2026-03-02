// Database entity types (matching data-model.md)

export type Route = {
  id: string;
  name: string;
  van_id: string;
  created_at: string;
  updated_at: string;
};

export type Van = {
  id: string;
  name: string;
  location_url: string | null;
  location_updated_at: string | null;
  ingestion_token: string;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy_m: number | null;
  last_speed_mps: number | null;
  last_heading_deg: number | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleEntry = {
  id: string;
  route_id: string;
  stop_name: string;
  time: string; // HH:mm
  stop_lat: number | null;
  stop_lng: number | null;
  geofence_radius_m: number;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_urgent: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "superuser" | "driver";
  is_active: boolean;
  created_at: string;
};

export type VanLocationPing = {
  id: string;
  van_id: string;
  device_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  device_ts: string;
  received_at: string;
};

export type RouteRun = {
  id: string;
  route_id: string;
  service_date: string;
  created_at: string;
  updated_at: string;
};

export type RouteRunStop = {
  run_id: string;
  schedule_entry_id: string;
  status: "pending" | "passed";
  passed_at: string | null;
};

// Computed types (BFF response shapes)

export type RunStatus = "waiting" | "in_progress" | "idle" | "completed";

export type ScheduleStatus = "active" | "ended" | "not_started";

export type NextStop = {
  stopName: string;
  time: string; // HH:mm
  id: string;
};

export type RouteProgress = {
  serviceDate: string;
  runStatus?: RunStatus;
  shiftStartedAt?: string | null;
  nextStopId: string | null;
  passedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  etaSource: "gps" | "schedule" | null;
};

export type RouteWithStatus = {
  id: string;
  name: string;
  isRunning: boolean;
  nextStop: NextStop | null;
  scheduleStatus: ScheduleStatus;
  totalStops: number;
  currentStopIndex: number | null;
  van: {
    id: string;
    locationUrl: string | null;
    locationUpdatedAt: string | null;
    isLocationOutdated: boolean;
    lastLat: number | null;
    lastLng: number | null;
  };
  progress: RouteProgress | null;
};

export type RouteDetail = RouteWithStatus & {
  schedule: {
    id: string;
    stopName: string;
    time: string;
  }[];
};

export type AnnouncementResponse = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  isUrgent: boolean;
  expiresAt: string | null;
  createdAt: string;
};

// Driver types

export type DriverRoute = {
  id: string;
  name: string;
  vanName: string;
  totalStops: number;
  firstStopTime: string | null;
  lastStopTime: string | null;
  runStatus: RunStatus;
  run: {
    id: string;
    serviceDate: string;
  } | null;
  activeShift: {
    id: string;
    driverId: string;
    startedAt: string;
  } | null;
  todayShifts: {
    id: string;
    driverId: string;
    driverEmail: string;
    startedAt: string;
    endedAt: string | null;
  }[];
};

// New entity types

export type VanDriver = {
  van_id: string;
  driver_id: string;
  created_at: string;
};

export type RouteShift = {
  id: string;
  run_id: string;
  driver_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

// Client-side derived types

export type TimelineStopStatus = "past" | "current" | "future" | "neutral";

export type TimelineStop = {
  id: string;
  stopName: string;
  time: string;
  status: TimelineStopStatus;
};

// API error shape

export type ApiError = {
  error: {
    code: ErrorCode;
    message: string;
  };
};

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INVALID_MESSAGE"
  | "INTERNAL_ERROR";
