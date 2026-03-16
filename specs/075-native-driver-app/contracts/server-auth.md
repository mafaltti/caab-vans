# Contract: Dual-Mode Server Auth

**Feature Branch**: `075-native-driver-app`

## Overview

Extend existing cookie-based auth to additionally accept bearer tokens from native callers. Add bound-van enforcement for native device binding.

## Auth Headers (Native Callers)

All driver endpoints accept these optional headers:

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | For native | `Bearer <supabase_access_token>` |
| `x-bound-van-id` | For native | UUID of provisioned van |
| `x-ingestion-token` | For native | Per-van ingestion token |

Web callers continue using cookies. Headers are optional — absence means web caller.

## Modified Function: `requireAuth(request?: NextRequest)`

**Current signature**: `requireAuth(): Promise<AuthResult>`
**New signature**: `requireAuth(request?: NextRequest): Promise<AuthResult>`

**Behavior**:
1. If `request` has `Authorization: Bearer <token>`:
   - Validate token via `supabase.auth.getUser(token)`
   - Extract `app_metadata.role` and `app_metadata.is_active`
   - Return `AuthResult` on success
   - Throw 401 if invalid token, throw 403 if inactive
2. If no bearer header (or no `request` param):
   - Fall back to existing cookie-based flow (unchanged)

**Return type** (unchanged):
```typescript
interface AuthResult {
  user: { id: string; email: string }
  role: "admin" | "superuser" | "driver"
}
```

## New Function: `requireBoundVan(request: NextRequest)`

**Signature**: `requireBoundVan(request: NextRequest): Promise<string | null>`

**Behavior**:
1. Read `x-bound-van-id` and `x-ingestion-token` from headers.
2. If both present:
   - Query `vans` table for matching `id` + `ingestion_token`.
   - Return `vanId` on match.
   - Throw 401 if token invalid, throw 404 if van not found.
3. If either absent: return `null` (web caller, no filtering).

## Endpoint Changes

### GET /api/driver/routes

**Current**: Returns all routes assigned to the authenticated driver.
**Change**: If `requireBoundVan()` returns a van ID, additionally filter results to only routes where `route.van_id === boundVanId`.

### GET /api/driver/routes/[routeId]

**Current**: Returns route detail if driver is assigned.
**Change**: If `requireBoundVan()` returns a van ID, reject with 403 if `route.van_id !== boundVanId`.

### POST /api/routes/[routeId]/start

**Change**: If bound van present, reject with 403 if route's van doesn't match.

### POST /api/routes/[routeId]/confirm-start-stop

**Change**: If bound van present, reject with 403 if route's van doesn't match.

### POST /api/routes/[routeId]/skip-stop

**Change**: If bound van present, reject with 403 if route's van doesn't match.

### POST /api/routes/[routeId]/detour

**Change**: If bound van present, reject with 403 if route's van doesn't match.

### POST /api/routes/[routeId]/end

**Change**: If bound van present, reject with 403 if route's van doesn't match.

## Error Responses

All error responses use existing `apiError()` format:

| Scenario | Status | Code | Message |
|----------|--------|------|---------|
| Missing/invalid bearer token | 401 | UNAUTHORIZED | "Invalid or expired token" |
| Inactive user (bearer) | 403 | FORBIDDEN | "Account is inactive" |
| Invalid ingestion token | 401 | UNAUTHORIZED | "Invalid ingestion token" |
| Van not found | 404 | NOT_FOUND | "Van not found" |
| Route not bound to van | 403 | FORBIDDEN | "Route not assigned to this van" |

## Backward Compatibility

- All headers are optional. Web callers send no native headers → existing behavior unchanged.
- Cookie auth path is untouched — `requireAuth()` without `request` param works exactly as before.
- Response shapes are unchanged for all endpoints.
- No new endpoints; only header handling added to existing ones.
