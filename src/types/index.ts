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
  created_at: string;
  updated_at: string;
};

export type ScheduleEntry = {
  id: string;
  route_id: string;
  stop_name: string;
  time: string; // HH:mm
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
  role: "admin" | "superuser";
  is_active: boolean;
  created_at: string;
};

// Computed types (BFF response shapes)

export type ScheduleStatus = "active" | "ended" | "not_started";

export type NextStop = {
  stopName: string;
  time: string; // HH:mm
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
  };
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

// Client-side derived types

export type TimelineStopStatus = "past" | "current" | "future";

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
