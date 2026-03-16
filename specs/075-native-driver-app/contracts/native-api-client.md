# Contract: Native API Client

**Feature Branch**: `075-native-driver-app`

## Overview

The Expo app calls existing driver endpoints with bearer token auth and bound-van headers. No new endpoints are created.

## Request Pattern

All driver API calls from the native app include:

```
Authorization: Bearer <supabase_access_token>
x-bound-van-id: <provisioned_van_uuid>
x-ingestion-token: <provisioned_ingestion_token>
Content-Type: application/json
```

## API Helper

New `fetchWithDriverAuth(path, options)` utility:

```typescript
async function fetchWithDriverAuth(
  path: string,
  options?: { method?: string; body?: object }
): Promise<Response>
```

- Reads `apiBaseUrl` from DeviceProvisioning.
- Reads access token from DriverSession.
- Reads `vanId` and `ingestionToken` from DeviceProvisioning.
- Constructs full URL: `${apiBaseUrl}${path}`.
- Sets all three auth headers automatically.
- If response is 401, attempts token refresh via Supabase SDK and retries once.

## Endpoints Consumed

### Authentication

| Action | Method | Notes |
|--------|--------|-------|
| Sign in | Supabase SDK `signInWithPassword()` | Direct to Supabase Auth, not via Next.js API |
| Sign out | Supabase SDK `signOut()` | Local session clear |
| Refresh | Supabase SDK auto-refresh | Transparent |

### Driver Routes

| Endpoint | Method | Request | Response (key fields) |
|----------|--------|---------|----------------------|
| `/api/driver/routes` | GET | — | `{ routes: DriverRoute[], serverTime, userId }` |
| `/api/driver/routes/[routeId]` | GET | — | `{ route: RouteDetail, serverTime }` |
| `/api/routes/[routeId]/start` | POST | `{ lat?, lng? }` | `{ shift, run, coldStart? }` |
| `/api/routes/[routeId]/confirm-start-stop` | POST | `{ stopId }` | `{ confirmed, nextStopId, lastPassedStopId, passedCount }` |
| `/api/routes/[routeId]/skip-stop` | POST | `{ stopId, reasonCode, note? }` | `{ skipped, stop, progress, event }` |
| `/api/routes/[routeId]/detour` | POST | `{ action, reasonCode?, note? }` | `{ detour, event }` |
| `/api/routes/[routeId]/end` | POST | — | `{ shift, run }` |

### Tracking (Unchanged)

| Endpoint | Method | Auth | Notes |
|----------|--------|------|-------|
| `/api/tracking/[vanId]` | POST | `x-ingestion-token` | Single ping (existing) |
| `/api/tracking-batch/[vanId]` | POST | `x-ingestion-token` | Batch flush (existing) |
| `/api/tracker-config/[vanId]` | GET | `x-ingestion-token` | Geofence config (existing) |

Tracking endpoints remain unchanged — they use ingestion token auth, not bearer auth.

## Error Handling

| Status | Native App Behavior |
|--------|-------------------|
| 401 | Retry with refreshed token; if still 401, redirect to login |
| 403 (role) | Show "Access denied" error, redirect to login |
| 403 (van mismatch) | Show "Route not assigned to this van" error |
| 404 | Show "Not found" error |
| 409 | Show conflict message (e.g., "Shift already active") |
| 5xx | Show generic error with retry option |
| Network error | Show offline indicator; retry on connectivity |

## Polling

- Active route screen: `GET /api/driver/routes/[routeId]` every 5 seconds via `setInterval`.
- Route list: single fetch on mount, no polling.
- Polling stops when screen unmounts or app backgrounds.
