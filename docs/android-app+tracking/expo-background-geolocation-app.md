# Expo Background Geolocation App

You are a senior React Native / Expo engineer. Build a **SIMPLE** Expo app (TypeScript) that shares device geolocation in near-realtime to a REST API, and **MUST** keep working with the screen locked on Android.

## Integration Story

This app **replaces** the current Pabbly/Telegram ingestion flow used for van location tracking.

**Current flow (deprecated):**
Telegram message → Pabbly webhook → `POST /api/ingest/[vanId]` → extracts Google Maps URL → stores `vans.location_url`

**New flow:**
Expo app → `POST /api/tracking/[vanId]` → stores raw coordinates in `device_locations` table + updates `vans.location_updated_at`

Key changes:
- `vans.location_url` becomes **deprecated** — replaced by raw `lat`/`lng` coordinates stored in `device_locations`.
- The web app will render an **embedded map** (Leaflet/OpenStreetMap) using stored coordinates. Full frontend spec is separate.
- No Google Maps URL generation — the app sends raw coordinates only.

## Hard Requirements

- Use Expo + TypeScript.
- Must support Android background tracking with screen locked using `expo-location` + `expo-task-manager`, running as a foreground service with persistent notification.
- Must **NOT** rely on Expo Go. Use an EAS Development Build approach and document it.
- Tracking sends location to a REST endpoint via `POST {API_BASE_URL}/api/tracking/{vanId}`.
- Authenticate with `x-ingestion-token: <token>` header, using the van's `ingestion_token` from the `vans` table.
- Provide Start / Stop tracking UI with clear status (tracking on/off, last sent time, last lat/lng, last error).
- Throttle to be battery friendly: send when distance >= 5m OR every 3s, whichever comes later (best effort). Drop points with accuracy > 50m.
- **Offline buffering:** buffer up to 50 unsent points in AsyncStorage when network is unavailable. Flush buffer (oldest first) when connectivity returns. Drop oldest points if buffer exceeds 50.
- Store minimal state locally (tracking enabled flag, last sent timestamp) using AsyncStorage.
- Include `"deviceId"` field (generate once and persist, e.g., UUID) for diagnostic/audit purposes — included in every POST body.
- Add robust error handling: network failures should not crash; buffer the point and keep trying on next update.
- Create a "Settings" screen with fields: **API Base URL**, **Van ID**, and **Ingestion Token** (all persisted in AsyncStorage).
- Use minimal dependencies; no heavy state management frameworks.

## Timezone Note

The app sends UTC timestamps (`Date.now()` — Unix milliseconds). The server converts to `America/Bahia` for display and "updated today" logic.

## Project Output

### 1) Expo Project Structure

- `app.json` / `app.config` configured properly:
  - `expo-location` plugin with `isAndroidBackgroundLocationEnabled` and `isAndroidForegroundServiceEnabled`
  - Android permissions: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`
- TaskManager task defined in a dedicated file (e.g., `src/location/task.ts`) and imported early so it is registered.
- A service wrapper (`src/location/tracking.ts`) exposing `startTracking()` and `stopTracking()`.
- UI screens: Home (start/stop + status), Settings.
- A simple navigation solution (Expo Router OR React Navigation; pick one and keep it minimal).

### 2) Exact Commands to Run

- Install dependencies
- Create EAS dev build for Android
- Run on device/emulator
- How to test locked-screen tracking

### 3) Full Code Files

- `app.json` / `app.config`
- Main entry (ensuring task is registered)
- Location task definition
- Tracking start/stop module
- API client module (POST location to `/api/tracking/{vanId}`)
- Offline buffer module (AsyncStorage queue, max 50 points)
- Storage module
- Home screen
- Settings screen (API Base URL, Van ID, Ingestion Token)

## REST API Contract

- **Endpoint:** `POST {API_BASE_URL}/api/tracking/{vanId}`
- **Headers:**
  - `Content-Type: application/json`
  - `x-ingestion-token: <token>`
- **URL params:**
  - `vanId` — UUID of the van (configured in Settings)
- **Body JSON:**

```json
{
  "deviceId": "uuid-string",
  "lat": -12.9714,
  "lng": -38.5124,
  "accuracy": 8.5,
  "speed": 12.3,
  "heading": 180.0,
  "ts": 1717012345678
}
```

| Field      | Type            | Description                                  |
|------------|-----------------|----------------------------------------------|
| `deviceId` | `string`        | Persisted UUID for this device (diagnostic)  |
| `lat`      | `number`        | Latitude (WGS84)                             |
| `lng`      | `number`        | Longitude (WGS84)                            |
| `accuracy` | `number | null` | Horizontal accuracy in meters                |
| `speed`    | `number | null` | Speed in m/s                                 |
| `heading`  | `number | null` | Heading in degrees (0–360)                   |
| `ts`       | `number`        | Unix milliseconds (UTC) — `Date.now()`       |

**Note:** `vanId` is in the URL path, not the body. `deviceId` is for diagnostic/audit purposes only — it does not affect routing or van identification.

### Server Responses

**Success — `200 OK`:**

```json
{
  "received": true,
  "ts": 1717012345700
}
```

**Validation error — `400 Bad Request`:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "lat must be a number"
  }
}
```

**Unauthorized — `401 Unauthorized`:**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid ingestion token"
  }
}
```

**Van not found — `404 Not Found`:**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Van not found"
  }
}
```

**Rate limited — `429 Too Many Requests`:**

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

## Backend Contract

This section defines the server-side implementation for `POST /api/tracking/[vanId]`.

### Route Handler: `src/app/api/tracking/[vanId]/route.ts`

Follows the same patterns as the existing `src/app/api/ingest/[vanId]/route.ts`.

**Auth:**
- Read `x-ingestion-token` header.
- Look up `vans` row by `vanId`.
- Compare token against `vans.ingestion_token`. Return `401` if mismatch.

**Rate Limit:**
- ~1,500 requests/hour per van (to accommodate 3s send interval = ~1,200 req/hour with headroom).
- Use `createRateLimiter({ windowMs: 60_000, maxRequests: 25 })` (25/min ≈ 1,500/hour).

**Validation (Zod schema):**

```ts
import { z } from "zod";

const trackingSchema = z.object({
  deviceId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nullable(),
  speed: z.number().nullable(),
  heading: z.number().nullable(),
  ts: z.number().int().positive(),
});
```

**Storage — two operations in sequence:**

1. **Insert** into `device_locations` table (full history):

```sql
INSERT INTO device_locations (van_id, device_id, lat, lng, accuracy, speed, heading, device_ts)
VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0));
```

2. **Update** `vans` row (latest timestamp):

```sql
UPDATE vans SET location_updated_at = now() WHERE id = $1;
```

### Database Table: `device_locations`

```sql
CREATE TABLE device_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id        UUID NOT NULL REFERENCES vans(id),
  device_id     UUID NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  accuracy      DOUBLE PRECISION,
  speed         DOUBLE PRECISION,
  heading       DOUBLE PRECISION,
  device_ts     TIMESTAMPTZ NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_locations_van_id_received
  ON device_locations (van_id, received_at DESC);
```

### Response

On success: `200 { "received": true, "ts": <server unix ms> }`

## Settings Screen

The app Settings screen must include the following fields, all persisted in AsyncStorage:

| Field             | Type   | Description                                    |
|-------------------|--------|------------------------------------------------|
| API Base URL      | string | Base URL for the API (default: production URL) |
| Van ID            | UUID   | The van this device is tracking                |
| Ingestion Token   | string | From the admin panel — authenticates requests  |

All three fields are required before tracking can start. The app should validate that Van ID is a valid UUID format before saving.

## Throttle & Rate Limit

- **Client-side throttle:** send when distance >= 5m OR every 3s, whichever comes later (best effort). Drop points with accuracy > 50m.
- **Server-side rate limit:** ~1,500 requests/hour per van (25/min). Client should handle `429` gracefully by backing off.
- These values support near-realtime tracking (~1,200 req/hour at 3s interval) with headroom for buffered flushes.

## Offline Buffering

When the device has no network connectivity:
- Buffer unsent location points in AsyncStorage (FIFO queue).
- Maximum buffer size: **50 points**.
- If the buffer is full, drop the **oldest** point to make room for the new one.
- When connectivity returns, flush the buffer **oldest first** before sending new points.
- Each buffered point uses the original `ts` from when it was captured.

## Frontend Integration Note

The CAAB Vans web app will display van positions on an **embedded map** (Leaflet/OpenStreetMap) using the coordinates stored in `device_locations`. The map implementation is covered in a separate frontend spec — this document defines only the data pipeline that feeds it.

## Quality Bar

- Keep it small and readable. No overengineering.
- Add comments explaining Android constraints (foreground service, background permission flow).
- Ensure permission flow is correct: `requestForegroundPermissionsAsync`, then `requestBackgroundPermissionsAsync` on Android.
- Handle Android 13+ notification permission gracefully.
- Do not ship secrets in code; default token/vanId empty until set in Settings.
- Use environment variables only if they work in Expo without extra complexity; otherwise rely on Settings.
- Deliver everything as a structured plan + final code files + run/test instructions.
