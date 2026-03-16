# Data Model: Native Driver App

**Feature Branch**: `075-native-driver-app` | **Date**: 2026-03-16

> No database migration required. All entities below are either existing DB tables (unchanged) or local-only storage on the Expo app.

## Server-Side Entities (Existing — No Changes)

### vans
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | text | |
| ingestion_token | text | Used for bound-van validation |
| driver_id | UUID (nullable, FK → auth.users) | 1:1 optional driver assignment |
| last_lat, last_lng | float | Latest GPS position |
| last_speed_mps | float | |
| location_updated_at | timestamptz | |

### routes
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| name | text | |
| van_id | UUID (FK → vans, UNIQUE) | 1:1 van binding |

### route_drivers
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| route_id | UUID (FK → routes) | |
| driver_id | UUID (FK → auth.users) | |

### route_runs
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| route_id | UUID (FK → routes) | |
| service_date | date | Daily instance |
| started_at | timestamptz (nullable) | |
| ended_at | timestamptz (nullable) | |
| next_stop_id | UUID (nullable) | Head-of-line pointer |
| has_skipped_stops | boolean | |
| is_detour_active | boolean | |
| detour_reason_code | text (nullable) | |
| detour_note | text (nullable) | |

**State machine**: waiting (started_at NULL) → in_progress (ended_at NULL) → completed (both set)

### route_shifts
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| run_id | UUID (FK → route_runs) | |
| driver_id | UUID (FK → auth.users) | |
| started_at | timestamptz | |
| ended_at | timestamptz (nullable) | |

### schedule_entries
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| route_id | UUID (FK → routes) | |
| stop_name | text | |
| arrival_time | text (HH:mm) | |
| departure_time | text (HH:mm) | |
| stop_sequence | int | |
| stop_lat, stop_lng | float (nullable) | |

### route_run_stops
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| run_id | UUID (FK → route_runs) | |
| schedule_entry_id | UUID (FK → schedule_entries) | |
| status | text | "pending" / "passed" / "skipped" |
| passed_at | timestamptz (nullable) | |
| reason_code | text (nullable) | For skipped stops |
| note | text (nullable) | |

### auth.users (Supabase Auth)
| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | |
| email | text | |
| app_metadata.role | text | "admin" / "superuser" / "driver" |
| app_metadata.is_active | boolean | |

---

## Client-Side Entities (Expo App — Local Storage)

### DeviceProvisioning (refactored from existing Settings)
| Field | Storage | Notes |
|-------|---------|-------|
| apiBaseUrl | AsyncStorage | Server URL |
| vanId | AsyncStorage | UUID, validated |
| ingestionToken | SecureStore | Per-van auth token |

**Lifecycle**: Set once by support. Survives driver session changes. Only modified via hidden support gesture.

### DriverSession (new)
| Field | Storage | Notes |
|-------|---------|-------|
| accessToken | SecureStore | Supabase JWT |
| refreshToken | SecureStore | Supabase refresh token |
| userId | AsyncStorage | Driver user ID |
| email | AsyncStorage | Driver email |
| role | AsyncStorage | "driver" (validated on login) |

**Lifecycle**: Created on sign-in, auto-refreshed by SDK, cleared on sign-out. Independent of device provisioning.

### ShiftState (new)
| Field | Storage | Notes |
|-------|---------|-------|
| shiftActive | AsyncStorage + DeviceProtected | Boolean flag |
| activeRouteId | AsyncStorage + DeviceProtected | UUID of active route |
| activeShiftId | AsyncStorage | UUID of active shift |

**Lifecycle**: Set on shift start, cleared on shift end. Dual-written to device-protected storage for reboot resilience.

**State transitions**:
```
idle (shiftActive=false)
  → starting (shift API called, waiting for response)
  → active (shiftActive=true, tracking running)
  → ending (end API called, waiting for tracking stop)
  → idle

Recovery states:
  → tracking_failed (shift started but tracking didn't start)
  → stop_failed (shift ended but tracking didn't stop)
```

---

## Relationships

```
DeviceProvisioning ──1:1──▶ vans (via vanId)
DriverSession ──1:1──▶ auth.users (via userId)
ShiftState ──1:1──▶ route_shifts (via activeShiftId)
ShiftState ──1:1──▶ routes (via activeRouteId)

vans ──1:1──▶ routes (via routes.van_id)
routes ──1:N──▶ route_runs (daily instances)
route_runs ──1:N──▶ route_shifts (driver shifts)
route_runs ──1:N──▶ route_run_stops (stop progress)
routes ──1:N──▶ schedule_entries (stop definitions)
routes ──1:N──▶ route_drivers (driver assignments)
```
